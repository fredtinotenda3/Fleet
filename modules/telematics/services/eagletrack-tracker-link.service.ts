// modules/telematics/services/eagletrack-tracker-link.service.ts
//
// The admin uin <-> vehicle mapping screen's service layer.
//
// ---------------------------------------------------------------------
// THE SECURITY-CRITICAL PART IS orgUnitId
// ---------------------------------------------------------------------
// A link row is org-unit scoped, and its orgUnitId is DERIVED from a
// scope-checked vehicle lookup -- never accepted from the request body,
// and never defaulted to the caller's own unit.
//
// That is the exact shape of the Phase 6 finance rule, and it is here
// for the same reason. If a caller could supply the unit, a branch
// manager could link another branch's tracker to a vehicle and stamp
// their own scope on the row; from then on that tracker's entire
// movement history -- and its odometer, its fuel level, its geofence
// crossings -- would be ingested against a vehicle in their branch. That
// is not a read leak, it is a write that corrupts another branch's data,
// and it is unwindable only by hand.
//
// So the vehicle is resolved through assertVehicleInScope first, and the
// link inherits whatever unit that vehicle actually has. A caller who
// cannot see the vehicle gets a 404 and writes nothing.
//
// ---------------------------------------------------------------------
// WHAT THE SCREEN LISTS
// ---------------------------------------------------------------------
// `unmatched` comes from the snapshot the last sync recorded on the
// tenant's Eagle Track config (EagleTrackUnmatchedTracker) -- the
// adapter has always reported unmatched uins for exactly this purpose
// and they were previously thrown away.
//
// The snapshot is ORGANIZATION-wide, not org-unit scoped, and it has to
// be: an unmatched tracker is by definition one that resolved to no
// vehicle, so there is no vehicle to inherit a unit from and nothing to
// filter on. A tracker with no owner cannot be attributed to a branch
// without first deciding which branch owns it -- which is the very
// question this screen exists to answer. The list carries no telemetry:
// a uin, a vendor-supplied name, a model. The WRITE is where scope is
// enforced, and it is enforced against the vehicle.

import { TenantContext } from '@/modules/tenancy/services/tenant-context.service';
import { ConflictError, NotFoundError, ValidationError } from '@/server/errors/app.errors';
import { eagletrackConfigRepository } from '../repositories/eagletrack-config.repository';
import {
  eagletrackTrackerLinkRepository,
  EagleTrackTrackerLinkRepository,
} from '../repositories/eagletrack-tracker-link.repository';
import {
  EagleTrackTrackerLink,
  EagleTrackUnmatchedTracker,
} from '../adapters/eagletrack/eagletrack.types';
import { assertVehicleInScope } from './telematics-scope.utils';

export interface TrackerLinkView {
  uin: string;
  vehicleId: string;
  licensePlate?: string;
  trackerName?: string;
  note?: string;
  updatedAt: string;
}

export interface TrackerMappingOverview {
  /** Trackers the last sync could not attribute to any vehicle. Empty when Eagle Track has never synced. */
  unmatched: EagleTrackUnmatchedTracker[];
  /** Links visible to this caller. */
  links: TrackerLinkView[];
  /** When the snapshot was taken, so the screen can say how stale its worklist is. */
  lastSyncAt: string | null;
  eagletrackConfigured: boolean;
}

export class EagleTrackTrackerLinkService {
  async getOverview(context: TenantContext): Promise<TrackerMappingOverview> {
    const [config, links] = await Promise.all([
      eagletrackConfigRepository.getConfig(context.organizationId),
      eagletrackTrackerLinkRepository.listInScope(context),
    ]);

    return {
      unmatched: config?.lastUnmatchedTrackers ?? [],
      links: links.map(toView),
      lastSyncAt: config?.lastSyncAt ? new Date(config.lastSyncAt).toISOString() : null,
      eagletrackConfigured: Boolean(config),
    };
  }

  /**
   * Links a tracker to a vehicle.
   *
   * The vehicle lookup is the authorization boundary AND the source of
   * the row's org unit -- see the header. Both come from the same call,
   * so they cannot disagree.
   */
  async createLink(
    input: { uin: string; vehicleId: string; note?: string },
    context: TenantContext,
    userId: string
  ): Promise<TrackerLinkView> {
    const uin = input.uin.trim();
    if (!uin) throw new ValidationError('A tracker uin is required');

    if (!EagleTrackTrackerLinkRepository.isVehicleIdShaped(input.vehicleId)) {
      // Caught here rather than at the lookup so the caller gets "that
      // is not a vehicle id" instead of an indistinguishable 404 -- and
      // so a license plate pasted into this field is diagnosable. The
      // link stores the vehicle _id, NOT a plate: plates are mutable and
      // a re-plated vehicle would silently break the link.
      throw new ValidationError('vehicleId must be a vehicle id, not a license plate');
    }

    // Throws NotFoundError for a vehicle outside this caller's tenant OR
    // outside their org-unit scope.
    const vehicle = await assertVehicleInScope(input.vehicleId, context);

    /**
     * A tracker links to ONE vehicle. Re-pointing an existing link at a
     * different vehicle is refused rather than silently applied: it
     * changes which vehicle every future reading is attributed to, and
     * doing that as a side effect of a create is how somebody
     * accidentally reassigns a tracker's whole future history. The
     * operator must delete the old link first, which is one deliberate
     * extra step in exactly the place a deliberate step is warranted.
     *
     * Checked WITHOUT the org-unit predicate: an existing link owned by
     * another branch still blocks, and must, or two branches could hold
     * conflicting links for one tracker and the sync's answer would
     * depend on document order.
     */
    const existing = await eagletrackTrackerLinkRepository.findByUin(context.organizationId, uin);
    if (existing && existing.vehicleId !== vehicle.vehicleId) {
      throw new ConflictError(
        `Tracker ${uin} is already linked to another vehicle. Remove that link before creating a new one.`
      );
    }

    const saved = await eagletrackTrackerLinkRepository.upsert(
      {
        tenantId: context.organizationId,
        uin,
        vehicleId: vehicle.vehicleId,
        // DERIVED, never supplied. See the header.
        ...(vehicle.orgUnitId ? { orgUnitId: vehicle.orgUnitId } : {}),
        licensePlate: vehicle.licensePlate,
        ...(input.note ? { note: input.note } : {}),
      },
      userId
    );

    return toView(saved);
  }

  /** Removes a link. Scope is part of the delete filter, so an out-of-scope uin removes nothing and 404s. */
  async removeLink(uin: string, context: TenantContext, userId: string): Promise<void> {
    const removed = await eagletrackTrackerLinkRepository.removeInScope(uin.trim(), context, userId);
    if (!removed) throw new NotFoundError('Tracker link not found');
  }
}

function toView(link: EagleTrackTrackerLink): TrackerLinkView {
  return {
    uin: link.uin,
    vehicleId: link.vehicleId,
    ...(link.licensePlate ? { licensePlate: link.licensePlate } : {}),
    ...(link.trackerName ? { trackerName: link.trackerName } : {}),
    ...(link.note ? { note: link.note } : {}),
    updatedAt: new Date(link.updatedAt).toISOString(),
  };
}

export const eagletrackTrackerLinkService = new EagleTrackTrackerLinkService();
