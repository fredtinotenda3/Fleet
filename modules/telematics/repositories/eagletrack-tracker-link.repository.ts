// modules/telematics/repositories/eagletrack-tracker-link.repository.ts
//
// The explicit, admin-managed uin -> vehicle mapping
// (`tbltelematics_eagletrack_links`).
//
// ---------------------------------------------------------------------
// WHY THIS COLLECTION EXISTS
// ---------------------------------------------------------------------
// eagletrack.adapter.ts's header has named this as the correct long-term
// fix since the integration shipped: matching a tracker to a vehicle by
// walking `plate` -> `__platenumber` -> `name` stands on vendor free
// text, and the header states the residual ambiguity plainly -- if
// `plate` and `name` hold the plates of two DIFFERENT vehicles, the
// order resolves it deterministically and nothing flags the conflict.
// An operator-declared link removes the guess entirely for the trackers
// somebody has looked at, and changes nothing for the rest.
//
// ---------------------------------------------------------------------
// SCOPING
// ---------------------------------------------------------------------
// ORG-UNIT SCOPED, inherited from the vehicle -- the same orgUnitSource
// the rest of the telematics module declares. Two consequences, both
// deliberate:
//
//   * `orgUnitId` is NEVER accepted from a request body. It is derived
//     from a scope-checked vehicle lookup in the service layer, exactly
//     as finance's allocation postings derive theirs. A caller who can
//     stamp their own scope onto a row can link another branch's
//     tracker to their own vehicle and start ingesting that branch's
//     movement history.
//   * The SYNC path reads by tenant + uin only, with no org-unit
//     predicate. That is correct rather than a gap: the background sync
//     runs with no user and therefore no scope, and the link's whole
//     purpose is to name the owning vehicle -- from which the reading's
//     own orgUnitId is then derived. The scoped variants below are for
//     the admin screen, where a human caller does have a scope.
//
// ---------------------------------------------------------------------
// UNIQUENESS
// ---------------------------------------------------------------------
// One live link per (tenantId, uin): a tracker is bolted to one vehicle.
// Enforced here by upsert-on-that-key rather than by a unique index,
// because adding a partial unique index to a collection this code also
// soft-deletes into is a migration with its own failure modes. The
// upsert makes a duplicate impossible on the write path we control; the
// changelog records the index as the belt-and-braces follow-up.
//
// The reverse direction (two uins on one vehicle) is deliberately
// ALLOWED. A vehicle with a tracker and a separate dashcam is a real
// configuration, and the readings stay distinguishable because each
// carries its own deviceId.

import { Db, Filter, ObjectId } from 'mongodb';
import connectToDatabase from '@/infrastructure/database/mongodb';
import { TenantContext } from '@/modules/tenancy/services/tenant-context.service';
import { tenantScopeService } from '@/modules/tenancy/services/tenant-scope.service';
import { EagleTrackTrackerLink } from '../adapters/eagletrack/eagletrack.types';

export class EagleTrackTrackerLinkRepository {
  private collectionName = 'tbltelematics_eagletrack_links';

  private async collection() {
    const db: Db = await connectToDatabase();
    return db.collection<EagleTrackTrackerLink>(this.collectionName);
  }

  /**
   * The org-unit predicate for this caller: `{}` for a full-visibility
   * role, `{ orgUnitId: { $in: [] } }` (matches nothing) for a scoped
   * caller with no accessible units. Fail closed, same helper the
   * telematics repository uses.
   */
  private scopeOf(context: TenantContext): Record<string, unknown> {
    return tenantScopeService.buildFilter<EagleTrackTrackerLink>(context, 'orgUnitId') as Record<
      string,
      unknown
    >;
  }

  /**
   * The link for one tracker, by tenant. Used by the SYNC path, which
   * has no caller and therefore no org-unit scope -- see the header.
   */
  async findByUin(tenantId: string, uin: string): Promise<EagleTrackTrackerLink | null> {
    const collection = await this.collection();
    return collection.findOne({ tenantId, uin, isDeleted: { $ne: true } } as Filter<EagleTrackTrackerLink>);
  }

  /**
   * Every live link for a tenant, keyed by uin.
   *
   * One query per sync rather than one per tracker: a 500-tracker
   * account would otherwise add 500 round trips to a poll that already
   * runs every staleness window.
   */
  async mapByUin(tenantId: string): Promise<Map<string, EagleTrackTrackerLink>> {
    const collection = await this.collection();
    const docs = await collection
      .find({ tenantId, isDeleted: { $ne: true } } as Filter<EagleTrackTrackerLink>)
      .toArray();

    const map = new Map<string, EagleTrackTrackerLink>();
    for (const doc of docs) map.set(doc.uin, doc as EagleTrackTrackerLink);
    return map;
  }

  /** Links visible to this caller, for the admin screen. */
  async listInScope(context: TenantContext): Promise<EagleTrackTrackerLink[]> {
    const collection = await this.collection();
    return collection
      .find({
        tenantId: context.organizationId,
        isDeleted: { $ne: true },
        ...this.scopeOf(context),
      } as Filter<EagleTrackTrackerLink>)
      .sort({ uin: 1 })
      .toArray() as Promise<EagleTrackTrackerLink[]>;
  }

  /**
   * Creates or replaces the link for one tracker.
   *
   * `orgUnitId` arrives already derived from a scope-checked vehicle
   * lookup (see the service) -- this method does not and must not accept
   * a caller-supplied value.
   *
   * The filter deliberately includes soft-deleted rows: re-linking a
   * tracker somebody previously unlinked should revive that row rather
   * than leave a tombstone that the (tenantId, uin) uniqueness argument
   * then has to reason around.
   */
  async upsert(
    input: {
      tenantId: string;
      uin: string;
      vehicleId: string;
      orgUnitId?: string;
      licensePlate?: string;
      trackerName?: string;
      note?: string;
    },
    userId: string
  ): Promise<EagleTrackTrackerLink> {
    const collection = await this.collection();
    const now = new Date();

    await collection.updateOne(
      { tenantId: input.tenantId, uin: input.uin } as Filter<EagleTrackTrackerLink>,
      {
        $set: {
          vehicleId: input.vehicleId,
          orgUnitId: input.orgUnitId,
          licensePlate: input.licensePlate,
          trackerName: input.trackerName,
          note: input.note,
          isDeleted: false,
          deletedAt: undefined,
          updatedAt: now,
          updatedBy: userId,
        },
        $setOnInsert: {
          tenantId: input.tenantId,
          uin: input.uin,
          createdAt: now,
          createdBy: userId,
        },
      } as never,
      { upsert: true }
    );

    const saved = await collection.findOne({
      tenantId: input.tenantId,
      uin: input.uin,
    } as Filter<EagleTrackTrackerLink>);
    if (!saved) throw new Error('Failed to persist Eagle Track tracker link');
    return saved as EagleTrackTrackerLink;
  }

  /**
   * Soft-deletes a link, scoped.
   *
   * The org-unit predicate is part of the FILTER rather than checked
   * afterwards, so a caller outside the link's scope deletes nothing and
   * learns nothing -- returning false is indistinguishable from "no such
   * link", which is the correct amount of information to give someone
   * asking about another branch's data.
   */
  async removeInScope(uin: string, context: TenantContext, userId: string): Promise<boolean> {
    const collection = await this.collection();
    const result = await collection.updateOne(
      {
        tenantId: context.organizationId,
        uin,
        isDeleted: { $ne: true },
        ...this.scopeOf(context),
      } as Filter<EagleTrackTrackerLink>,
      { $set: { isDeleted: true, deletedAt: new Date(), updatedAt: new Date(), updatedBy: userId } } as never
    );
    return result.modifiedCount > 0;
  }

  /** Whether a vehicle id is a plausible Mongo id at all -- cheap guard before a lookup. */
  static isVehicleIdShaped(vehicleId: string): boolean {
    return ObjectId.isValid(vehicleId);
  }
}

export const eagletrackTrackerLinkRepository = new EagleTrackTrackerLinkRepository();
