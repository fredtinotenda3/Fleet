// modules/telematics/services/eagletrack-trigger-sync.service.ts
//
// Syncs GET /api2/triggers into tbltelematics_eagletrack_triggers, and
// projects the SPATIAL ones into tbltelematics_geofences.
//
// ---------------------------------------------------------------------
// TWO DESTINATIONS, ON PURPOSE
// ---------------------------------------------------------------------
// Every trigger, of every type, is stored verbatim in the provider
// trigger collection: it is what the vendor's alert feed refers to by
// id, and an alert citing `triggerId: 4172` is unreadable without the
// row that says 4172 is "Depot overspeed, 80 km/h".
//
// Only three of the seven documented types describe a PLACE (Geo-fence,
// Area, Route Alert -- see eagletrack-triggers.map.ts), and only those
// become Geofence rows. The other four are thresholds. Manufacturing a
// boundary for a Speed Alert would put a phantom shape into
// telematics.service.ts's checkGeofence, which runs on EVERY location
// ping for EVERY vehicle -- so a fabricated geofence is not an inert bad
// row, it is a source of entry/exit alerts for a place that does not
// exist.
//
// And even for the three spatial types, a Geofence is created only when
// the payload yields READABLE geometry. A "Geo-fence" trigger whose
// coordinates we cannot parse is recorded with
// `geofenceSkippedReason: 'no-geometry'`. Giving it a default centre and
// radius would be inventing a place.
//
// ---------------------------------------------------------------------
// DUPLICATE PREVENTION
// ---------------------------------------------------------------------
// Both writes are keyed on the PROVIDER'S trigger id -- upsert on
// (tenantId, providerTriggerId) for the trigger row, and on
// (tenantId, provider, providerTriggerId) for the geofence. Matching on
// `name` instead would create a second boundary the moment somebody
// renamed one in the vendor UI, and the orphan would keep firing.
//
// Nothing is ever DELETED for being absent from a response. A transient
// partial response would otherwise remove rows the alert feed still
// cites, leaving alerts nobody can explain. `lastSeenAt` is what makes
// "this trigger has disappeared" answerable without a destructive pass.
//
// ---------------------------------------------------------------------
// SCOPING
// ---------------------------------------------------------------------
// A trigger bound to a uin inherits that vehicle's org unit, resolved
// through the SAME matcher the position sync uses -- two different
// answers to "whose tracker is this" is how a geofence ends up visible
// to the wrong branch. A trigger bound to no tracker is account-wide
// policy and carries no orgUnitId, which the "mine OR unassigned"
// read predicate treats as shared, exactly as it treats an operator's
// unassigned depot boundary.

import { monitoring } from '@/infrastructure/monitoring/logger';
import { EagleTrackApiClient } from '../adapters/eagletrack/eagletrack-api.client';
import { parseTriggerRows } from '../adapters/eagletrack/eagletrack-payload.parsers';
import {
  EagleTrackTrackerLink,
  EagleTrackTrigger,
  EagleTrackTriggerSyncResult,
} from '../adapters/eagletrack/eagletrack.types';
import { describeTriggerType } from '../adapters/eagletrack/eagletrack-triggers.map';
import { eagletrackConfigRepository } from '../repositories/eagletrack-config.repository';
import { eagletrackTriggerRepository } from '../repositories/eagletrack-trigger.repository';
import { telematicsRepository } from '../repositories/telematics.repository';
import { vehicleRepository } from '@/modules/vehicles/repositories/vehicle.repository';
import { Geofence } from '../types/telematics.types';

const PROVIDER = 'eagletrack';

export class EagleTrackTriggerSyncService {
  /**
   * Pulls the provider's trigger objects and reconciles both
   * destinations.
   *
   * `links` is the already-loaded uin -> vehicle link map from the
   * calling sync, so resolving a trigger's owning vehicle costs no extra
   * query for the linked case.
   *
   * Never throws, for the same reason the driver sync doesn't: a trigger
   * import failing must not stop positions being reported.
   */
  async sync(
    tenantId: string,
    client: EagleTrackApiClient,
    links: Map<string, EagleTrackTrackerLink>
  ): Promise<EagleTrackTriggerSyncResult> {
    const result: EagleTrackTriggerSyncResult = {
      fetched: 0,
      stored: 0,
      geofencesCreated: 0,
      geofencesUpdated: 0,
      geofencesSkippedNoGeometry: 0,
      nonSpatial: 0,
      unknownTypes: [],
      errors: [],
    };

    let triggers: EagleTrackTrigger[];
    try {
      triggers = parseTriggerRows(await client.getTriggers());
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown Eagle Track API error';
      result.errors.push(`triggers: ${message}`);
      monitoring.logError('[EagleTrackTriggerSync] Trigger fetch failed', error as Error, { tenantId });
      return result;
    }

    result.fetched = triggers.length;

    for (const trigger of triggers) {
      if (!trigger.providerTriggerId) {
        // Without a provider id there is no reconciliation key, so
        // storing it would create a fresh row on every sync. Reported
        // rather than silently dropped.
        result.errors.push('triggers: a trigger row carried no readable provider id and was skipped');
        continue;
      }

      try {
        await this.reconcileOne(tenantId, trigger, links, result);
        result.stored += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        result.errors.push(`trigger ${trigger.providerTriggerId}: ${message}`);
      }
    }

    await eagletrackConfigRepository.recordSubSyncAt(tenantId, { triggers: true });

    return result;
  }

  private async reconcileOne(
    tenantId: string,
    trigger: EagleTrackTrigger,
    links: Map<string, EagleTrackTrackerLink>,
    result: EagleTrackTriggerSyncResult
  ): Promise<void> {
    const descriptor = describeTriggerType(trigger.typeCode);
    if (!descriptor && trigger.typeCode !== null && !result.unknownTypes.includes(trigger.typeCode)) {
      result.unknownTypes.push(trigger.typeCode);
    }

    const owner = trigger.uin ? await this.resolveOwner(tenantId, trigger.uin, links) : null;

    // Which of the three "no geofence" outcomes applies. Recorded on the
    // row rather than inferred later, so an operator asking "why is my
    // vendor geofence not here" gets an answer instead of an absence.
    let geofenceId: string | undefined;
    let skippedReason: 'non-spatial' | 'no-geometry' | 'unknown-type' | undefined;

    if (!descriptor) {
      skippedReason = 'unknown-type';
    } else if (!descriptor.geofenceType) {
      skippedReason = 'non-spatial';
      result.nonSpatial += 1;
    } else if (!trigger.geometry) {
      skippedReason = 'no-geometry';
      result.geofencesSkippedNoGeometry += 1;
    } else {
      const projected = await this.projectGeofence(tenantId, trigger, owner);
      geofenceId = projected.geofenceId;
      if (projected.outcome === 'created') result.geofencesCreated += 1;
      else result.geofencesUpdated += 1;
    }

    await eagletrackTriggerRepository.upsert(trigger, {
      tenantId,
      ...(owner?.orgUnitId ? { orgUnitId: owner.orgUnitId } : {}),
      ...(owner?.vehicleId ? { vehicleId: owner.vehicleId } : {}),
      ...(geofenceId ? { geofenceId } : {}),
      ...(skippedReason ? { geofenceSkippedReason: skippedReason } : {}),
    });
  }

  /**
   * The vehicle (and therefore the org unit) a uin-bound trigger belongs
   * to, or null for an account-wide one.
   *
   * Uses the operator link first, exactly as the position sync does. The
   * plate/name fallbacks are NOT applied here: a trigger carries no
   * roster row, so there are no plate candidates to walk, and inventing
   * a lookup from the uin alone would be a different matching rule than
   * the one the readings use.
   */
  private async resolveOwner(
    tenantId: string,
    uin: string,
    links: Map<string, EagleTrackTrackerLink>
  ): Promise<{ vehicleId: string; orgUnitId?: string } | null> {
    const link = links.get(uin);
    if (!link?.vehicleId) return null;

    const vehicle = await vehicleRepository.findById(link.vehicleId, tenantId);
    if (!vehicle?._id) return null;

    return {
      vehicleId: String(vehicle._id),
      ...(vehicle.orgUnitId ? { orgUnitId: vehicle.orgUnitId } : {}),
    };
  }

  /** Turns readable trigger geometry into the Geofence coordinate shape and upserts on the provider key. */
  private async projectGeofence(
    tenantId: string,
    trigger: EagleTrackTrigger,
    owner: { vehicleId: string; orgUnitId?: string } | null
  ): Promise<{ geofenceId: string; outcome: 'created' | 'updated' }> {
    const geometry = trigger.geometry!;

    let type: Geofence['type'];
    let coordinates: Geofence['coordinates'];

    if (geometry.kind === 'circle') {
      type = 'circle';
      coordinates = { center: geometry.center, radius: geometry.radiusMeters };
    } else if (geometry.kind === 'route') {
      type = 'route';
      coordinates = { points: geometry.points, tolerance: geometry.toleranceMeters };
    } else {
      type = 'polygon';
      coordinates = { points: geometry.points };
    }

    return telematicsRepository.upsertProviderGeofence(
      {
        provider: PROVIDER,
        providerTriggerId: trigger.providerTriggerId,
        // Falls back to the provider id rather than to an invented
        // label: "Eagle Track trigger 4172" is at least true and
        // findable in the vendor UI.
        name: trigger.name ?? `Eagle Track trigger ${trigger.providerTriggerId}`,
        type,
        coordinates,
        ...(owner?.orgUnitId ? { orgUnitId: owner.orgUnitId } : {}),
        ...(owner?.vehicleId ? { vehicleId: owner.vehicleId } : {}),
      },
      tenantId
    );
  }
}

export const eagletrackTriggerSyncService = new EagleTrackTriggerSyncService();
