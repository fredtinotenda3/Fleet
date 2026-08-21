// modules/telematics/services/eagletrack-history.service.ts
//
// Historical route playback: GET /api2/history for one vehicle, ingested
// idempotently and served back as a breadcrumb trail.
//
// ---------------------------------------------------------------------
// READ-THROUGH, NOT A BACKFILL JOB
// ---------------------------------------------------------------------
// This runs when somebody asks for a vehicle's route, on the same
// read-through principle eagletrack-read-through.service.ts already
// established for the live poll (and for the same reason: this platform
// has no long-lived worker process to schedule a backfill on). Two
// consequences worth stating:
//
//   * Work is bounded by what a human asked for -- one vehicle, one
//     window -- rather than by fleet size. A scheduled backfill of every
//     vehicle's full history would be unbounded work triggered by
//     nobody.
//   * The vendor is queried ONLY for the parts of the window we do not
//     already hold. A second look at yesterday's route is served
//     entirely from tbltelematics.
//
// ---------------------------------------------------------------------
// WHY INGESTION BYPASSES telematicsService.ingestTelematicsData
// ---------------------------------------------------------------------
// Every live adapter writes through that service deliberately, so its
// readings get the same alerting and geofence evaluation as the generic
// ingest endpoint. That is exactly wrong for history. See
// telematicsRepository.bulkUpsertHistoricalReadings' doc comment for the
// full list; the short version is that replaying a month of points
// through the live path re-fires every geofence crossing, re-raises
// every speeding alert, notifies fleet managers about each one, and
// moves the live map to a stale position over a websocket.
//
// A backfill is an assertion about the past. It writes rows.
// Provider-side alerts for the same window are imported separately and
// explicitly by eagletrack-alert-sync.service.ts, which is the honest
// way to get historical alerting: the vendor's own events, with their
// own timestamps, not ours re-derived and re-notified.
//
// ---------------------------------------------------------------------
// SCOPING
// ---------------------------------------------------------------------
// FAIL CLOSED. Every entry point resolves the vehicle through
// assertVehicleInScope, which requires BOTH tenant ownership and -- for
// a scoped caller -- that the vehicle's org unit is in their accessible
// set. A vehicle with no org unit at all is refused for scoped callers:
// ownership cannot be established, so it is not established. The read
// back out goes through getTelematicsHistoryInScope, which applies the
// predicate again server-side, so the scope check is not the only thing
// standing between a caller and another branch's GPS trace.

import { monitoring } from '@/infrastructure/monitoring/logger';
import { TenantContext } from '@/modules/tenancy/services/tenant-context.service';
import { eagletrackAdapter, eagletrackDeviceIdFor, mapStatusToTelematicsData } from '../adapters/eagletrack/eagletrack.adapter';
import { clampRange, EagleTrackRangeQuery } from '../adapters/eagletrack/eagletrack-date-range';
import { EagleTrackApiClient, flattenLastPayload } from '../adapters/eagletrack/eagletrack-api.client';
import { telematicsRepository } from '../repositories/telematics.repository';
import { LiveMapRoutePoint } from '../types/live-map.types';
import { TelematicsData } from '../types/telematics.types';
import { assertVehicleInScope, ScopedVehicle } from './telematics-scope.utils';
import { eagletrackAlertSyncService } from './eagletrack-alert-sync.service';
import { EagleTrackAlertSyncResult } from '../adapters/eagletrack/eagletrack.types';

/** Vendor page size, as the brief specifies. */
export const HISTORY_PAGE_SIZE = 100;

/**
 * Hard ceiling on pages pulled for one request.
 *
 * 100 pages x 100 rows = 10,000 points, which is far more than a
 * breadcrumb needs and already several seconds of vendor round trips.
 * The cap exists so a wide window cannot issue unbounded requests inside
 * one serverless invocation and get killed halfway through, leaving a
 * partially-ingested window that looks complete.
 */
export const MAX_HISTORY_PAGES = 100;

/** Longest window a caller may request in one call. Mirrors the live map's own lookback ceiling reasoning. */
export const MAX_HISTORY_SPAN_MS = 7 * 24 * 60 * 60_000;

/** Points returned to the map for a trail. Well below the ingest cap -- a breadcrumb is not a replay. */
export const MAX_TRAIL_POINTS = 500;

export interface EagleTrackHistoryResult {
  vehicleId: string;
  uin: string | null;
  /** Chronological, oldest first -- the order a polyline is drawn in. */
  points: LiveMapRoutePoint[];
  ingested: {
    /** Rows the vendor returned for this window. */
    fetched: number;
    /** Rows written for the first time. A repeat request over the same window reports 0. */
    inserted: number;
    /** Rows we already held, recognised by (vehicle, device, provider timestamp). */
    existing: number;
    pagesFetched: number;
    /** True when MAX_HISTORY_PAGES stopped the pull before the vendor ran out. */
    truncated: boolean;
  };
  /** Exactly what went on the wire, so a wrong dateRange encoding is diagnosable in one look. */
  providerQuery: EagleTrackRangeQuery | null;
  /**
   * Vendor-side alerts imported for the SAME window, when requested.
   *
   * Bundled with the history pull rather than exposed as a third
   * endpoint because the two answer one question -- "what happened to
   * this vehicle between these times" -- and splitting them would make a
   * caller issue two requests over the same window and hope they agree.
   * Absent when the caller opted out (`includeAlerts=false`) or the
   * vehicle has no Eagle Track tracker.
   */
  alerts?: EagleTrackAlertSyncResult;
  /** Present when the vendor could not be reached; the stored points are still returned. */
  providerError?: string;
}

export class EagleTrackHistoryService {
  /**
   * Ingests the vendor's history for one vehicle over one window, then
   * returns the stored trail for that window.
   *
   * Vendor failure is NOT fatal: whatever is already stored is returned
   * with `providerError` set. An operator looking at last Tuesday's
   * route should still see it when the vendor is briefly unreachable.
   */
  async getHistory(
    vehicleId: string,
    context: TenantContext,
    requested: { from: Date; to: Date; includeAlerts?: boolean }
  ): Promise<EagleTrackHistoryResult> {
    const vehicle = await assertVehicleInScope(vehicleId, context);
    const { from, to } = clampRange(requested.from, requested.to, MAX_HISTORY_SPAN_MS);

    const uin = await this.resolveUin(vehicle, context.organizationId);

    const result: EagleTrackHistoryResult = {
      vehicleId: vehicle.vehicleId,
      uin,
      points: [],
      ingested: { fetched: 0, inserted: 0, existing: 0, pagesFetched: 0, truncated: false },
      providerQuery: null,
    };

    if (uin) {
      try {
        const client = await this.ingestWindow(vehicle, uin, from, to, result);

        /**
         * Vendor alerts for the same window.
         *
         * Runs only when positions were actually pulled -- the client
         * is returned by ingestWindow rather than rebuilt, so a tenant
         * with Eagle Track disabled does not get a second attempt at a
         * connection that already failed.
         *
         * Failures are absorbed into the result rather than thrown: a
         * missing alert import must not cost the operator the route
         * they asked for.
         */
        if (client && requested.includeAlerts !== false) {
          result.alerts = await eagletrackAlertSyncService.importForVehicle(vehicle, uin, client, {
            from,
            to,
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown Eagle Track API error';
        result.providerError = message;
        monitoring.logWarn('[EagleTrackHistoryService] History fetch failed; serving stored points', {
          tenantId: context.organizationId,
          vehicleId: vehicle.vehicleId,
          error: message,
        });
      }
    }

    result.points = await this.readStoredTrail(vehicle.vehicleId, from, to, context);
    return result;
  }

  /**
   * Pulls the window page by page and upserts each page as it arrives.
   *
   * Written per page rather than accumulated and written once at the
   * end: a wide window would otherwise hold ten thousand mapped readings
   * in memory and lose all of them if page ninety-one timed out.
   * Per-page writes mean a partial pull leaves partial -- but correct,
   * and idempotently resumable -- data.
   */
  private async ingestWindow(
    vehicle: ScopedVehicle,
    uin: string,
    from: Date,
    to: Date,
    result: EagleTrackHistoryResult
  ): Promise<EagleTrackApiClient | null> {
    const client = await eagletrackAdapter.buildClientFor(vehicle.tenantId);
    if (!client) {
      result.providerError = 'Eagle Track is not configured or not enabled for this organization.';
      return null;
    }

    const deviceId = eagletrackDeviceIdFor(uin);

    for (let pageIndex = 1; pageIndex <= MAX_HISTORY_PAGES; pageIndex += 1) {
      const page = await client.getHistory({
        uin,
        from,
        to,
        pageSize: HISTORY_PAGE_SIZE,
        pageIndex,
      });

      result.providerQuery = page.range;
      result.ingested.pagesFetched = pageIndex;

      // flattenLastPayload, not a bespoke parser: history rows are the
      // same position shape as `last`'s, and it already handles both the
      // array and uin-keyed forms and stamps uin from the key.
      const rows = flattenLastPayload(
        page.rows as Parameters<typeof flattenLastPayload>[0]
      );
      if (rows.length === 0) return client;

      result.ingested.fetched += rows.length;

      const readings: Array<Omit<TelematicsData, '_id' | 'createdAt' | 'updatedAt'> & { tenantId: string }> = [];
      for (const row of rows) {
        const mapped = mapStatusToTelematicsData(
          // The row's own uin is ignored in favour of the tracker this
          // request was FOR. A history response is scoped to one uin by
          // the request; trusting a per-row value would let a vendor-side
          // inconsistency write another vehicle's trace into this one.
          { ...row, uin },
          {
            tenantId: vehicle.tenantId,
            vehicleId: vehicle.vehicleId,
            deviceId,
            ...(vehicle.orgUnitId ? { orgUnitId: vehicle.orgUnitId } : {}),
          }
        );
        // No timestamp, or no usable fix -> skipped, never stamped with
        // `new Date()` and never placed at null island.
        if (mapped && mapped.payload.location) readings.push(mapped.payload);
      }

      const written = await telematicsRepository.bulkUpsertHistoricalReadings(readings, vehicle.tenantId);
      result.ingested.inserted += written.inserted;
      result.ingested.existing += written.existing;

      // Stop on the vendor's own page count when it gives one, on a
      // short page otherwise. Both, because neither is reliable alone:
      // some deployments omit `global.pageCount`, and some return a full
      // page followed by an empty one.
      if (page.pageCount !== null && pageIndex >= page.pageCount) return client;
      if (rows.length < HISTORY_PAGE_SIZE) return client;

      if (pageIndex === MAX_HISTORY_PAGES) result.ingested.truncated = true;
    }

    return client;
  }

  /**
   * The stored trail for the window, org-unit-scoped and thinned.
   *
   * Read back out of tbltelematics rather than returned from what was
   * just ingested, deliberately: this way the response includes points
   * from earlier ingests and from the live poll, and it passes through
   * the scoped read a second time. It also means a vendor outage still
   * returns a trail.
   */
  private async readStoredTrail(
    vehicleId: string,
    from: Date,
    to: Date,
    context: TenantContext
  ): Promise<LiveMapRoutePoint[]> {
    const history = await telematicsRepository.getTelematicsHistoryInScope(
      vehicleId,
      from,
      to,
      context,
      MAX_TRAIL_POINTS
    );

    return history
      .filter((entry) => Boolean(entry.location))
      .map((entry) => ({
        lat: entry.location!.lat,
        lng: entry.location!.lng,
        speed: entry.location!.speed,
        timestamp: new Date(entry.timestamp).toISOString(),
      }))
      // Repository returns newest-first; a polyline wants chronological.
      .reverse();
  }

  /**
   * The tracker id for a vehicle, from the device this integration
   * registered for it.
   *
   * Null when the vehicle has no Eagle Track device -- a Cartrack-only
   * or unmonitored vehicle. Not an error: the caller still gets whatever
   * stored history exists, which for such a vehicle is its Cartrack
   * trail. Refusing outright would make one endpoint answer for some
   * vehicles and 404 for others with no way to tell in advance.
   */
  private async resolveUin(vehicle: ScopedVehicle, tenantId: string): Promise<string | null> {
    return telematicsRepository.getEagleTrackUinForVehicle(vehicle.vehicleId, tenantId);
  }
}

export const eagletrackHistoryService = new EagleTrackHistoryService();
