// modules/telematics/repositories/eagletrack-trigger.repository.ts
//
// Eagle Track's own trigger objects (`tbltelematics_eagletrack_triggers`).
//
// ---------------------------------------------------------------------
// WHY THESE ARE NOT JUST GEOFENCES
// ---------------------------------------------------------------------
// Four of the seven documented trigger types (Speed, Idle, Stop, Custom)
// describe a THRESHOLD, not a place -- see eagletrack-triggers.map.ts.
// They have no geometry to store in a Geofence row, and fabricating one
// would put a phantom boundary into checkGeofence's per-ping evaluation.
// They still need somewhere to live, because they are what the vendor's
// alert feed refers to by id: a vendor alert carrying
// `triggerId: 4172` is unreadable without the row that says 4172 is
// "Depot overspeed, 80 km/h".
//
// So this collection holds ALL seven types verbatim, and the spatial
// ones ADDITIONALLY project into a Geofence (see
// telematicsRepository.upsertProviderGeofence). The provider id is the
// reconciliation key in both directions.
//
// SCOPING: org-unit, from the linked vehicle when the trigger names one.
// A trigger bound to no particular tracker is account-wide policy and
// carries no orgUnitId -- read with the same "mine OR unassigned"
// predicate getActiveGeofencesInScope uses, and for the same reason: a
// depot boundary every branch needs must not become invisible to all of
// them. That asymmetry is deliberate and is why the backfill refuses to
// invent an orgUnitId here.

import { Db, Filter } from 'mongodb';
import connectToDatabase from '@/infrastructure/database/mongodb';
import { TenantContext } from '@/modules/tenancy/services/tenant-context.service';
import { EagleTrackTrigger } from '../adapters/eagletrack/eagletrack.types';

/** One provider trigger as stored. */
export interface StoredEagleTrackTrigger {
  _id?: string;
  tenantId: string;
  orgUnitId?: string;
  providerTriggerId: string;
  name?: string;
  typeCode: number | null;
  typeLabel: string | null;
  active?: boolean;
  uin?: string;
  /** Resolved at sync time when the trigger names a uin we can attribute. Null when account-wide. */
  vehicleId?: string;
  speedLimitKmh?: number;
  durationMinutes?: number;
  hasGeometry: boolean;
  /** _id of the Geofence this trigger projects into, when it produced one. */
  geofenceId?: string;
  /** Why no geofence was created, when none was. Never a silent absence. */
  geofenceSkippedReason?: 'non-spatial' | 'no-geometry' | 'unknown-type';
  /** The provider row exactly as sent -- the architecture's "preserve raw provider payload" rule. */
  raw: Record<string, unknown>;
  unmappedFields: string[];
  firstSeenAt: Date;
  lastSeenAt: Date;
  isDeleted?: boolean;
}

export class EagleTrackTriggerRepository {
  private collectionName = 'tbltelematics_eagletrack_triggers';

  private async collection() {
    const db: Db = await connectToDatabase();
    return db.collection<StoredEagleTrackTrigger>(this.collectionName);
  }

  /**
   * Idempotent write, keyed on (tenantId, providerTriggerId).
   *
   * `firstSeenAt` is $setOnInsert so a trigger that has been present for
   * months does not appear to have been created by today's sync;
   * `lastSeenAt` is always refreshed, which is what makes "this trigger
   * has disappeared from the vendor" answerable later without a
   * destructive reconcile pass.
   *
   * Deliberately does NOT delete triggers absent from the current
   * response. A transient partial response would otherwise wipe rows the
   * vendor alert feed still references by id, leaving alerts that cannot
   * be explained.
   */
  async upsert(
    trigger: EagleTrackTrigger,
    context: {
      tenantId: string;
      orgUnitId?: string;
      vehicleId?: string;
      geofenceId?: string;
      geofenceSkippedReason?: StoredEagleTrackTrigger['geofenceSkippedReason'];
    }
  ): Promise<'created' | 'updated'> {
    const collection = await this.collection();
    const now = new Date();

    const result = await collection.updateOne(
      {
        tenantId: context.tenantId,
        providerTriggerId: trigger.providerTriggerId,
      } as Filter<StoredEagleTrackTrigger>,
      {
        $set: {
          name: trigger.name,
          typeCode: trigger.typeCode,
          typeLabel: trigger.typeLabel,
          active: trigger.active,
          uin: trigger.uin,
          orgUnitId: context.orgUnitId,
          vehicleId: context.vehicleId,
          speedLimitKmh: trigger.speedLimitKmh,
          durationMinutes: trigger.durationMinutes,
          hasGeometry: Boolean(trigger.geometry),
          geofenceId: context.geofenceId,
          geofenceSkippedReason: context.geofenceSkippedReason,
          raw: trigger.raw,
          unmappedFields: trigger.unmappedFields,
          lastSeenAt: now,
          isDeleted: false,
        },
        $setOnInsert: {
          tenantId: context.tenantId,
          providerTriggerId: trigger.providerTriggerId,
          firstSeenAt: now,
        },
      } as never,
      { upsert: true }
    );

    return result.upsertedCount > 0 ? 'created' : 'updated';
  }

  /**
   * Triggers visible to this caller.
   *
   * "Mine OR unassigned", not a bare $in -- see the header. A trigger
   * with no orgUnitId is account-wide policy and stays visible to
   * everyone, exactly as an unassigned geofence does.
   */
  async listInScope(context: TenantContext): Promise<StoredEagleTrackTrigger[]> {
    const collection = await this.collection();

    const conditions: Record<string, unknown>[] = [
      { tenantId: context.organizationId, isDeleted: { $ne: true } },
    ];

    if (context.accessibleOrgUnitIds !== null) {
      conditions.push({
        $or: [
          { orgUnitId: { $in: context.accessibleOrgUnitIds } },
          { orgUnitId: { $exists: false } },
          { orgUnitId: null },
        ],
      });
    }

    return collection
      .find({ $and: conditions } as Filter<StoredEagleTrackTrigger>)
      .sort({ typeCode: 1, name: 1 })
      .toArray() as Promise<StoredEagleTrackTrigger[]>;
  }

  /** One trigger by provider id, for resolving a vendor alert's `triggerId` to something readable. */
  async findByProviderId(tenantId: string, providerTriggerId: string): Promise<StoredEagleTrackTrigger | null> {
    const collection = await this.collection();
    return collection.findOne({
      tenantId,
      providerTriggerId,
      isDeleted: { $ne: true },
    } as Filter<StoredEagleTrackTrigger>);
  }
}

export const eagletrackTriggerRepository = new EagleTrackTriggerRepository();
