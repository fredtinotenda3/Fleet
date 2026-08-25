// modules/telematics/adapters/eagletrack/eagletrack.provider.ts
//
// PHASE 2 -- Eagle Track behind the canonical contract.
//
// ---------------------------------------------------------------------
// WHAT THIS IS AND IS NOT
// ---------------------------------------------------------------------
// The contract face of the Eagle Track integration. Like its Cartrack
// counterpart it does NOT replace `eagletrack.adapter.ts`, which keeps
// the working pipeline: query-param auth with token redaction, the
// text-then-parse client (the vendor labels successful JSON as
// `text/html`), the 3xx/login-page classification that stops a bad token
// reading as a platform outage, plate-candidate matching, the
// provider-clock staleness guard, org-unit inheritance, and the four
// sub-syncs. Re-deriving any of that would risk incidents this codebase
// has already had once.
//
// This class REUSES that hardened work rather than duplicating it:
// `parseEagleTrackDate` and the tracker/status types come straight from
// the adapter module. The only new code here is the projection onto the
// canonical shape.
//
// ---------------------------------------------------------------------
// CAPABILITIES -- FROM THE CODE THAT EXISTS
// ---------------------------------------------------------------------
//   LIVE_POSITION       yes -- getLastForAll()
//   HISTORICAL_POSITION yes -- eagletrack-history.service.ts
//   ALERTS              yes -- eagletrack-alert-sync.service.ts
//   FUEL_REPORT         yes -- /api2/reports/fuel, columnar parser
//   DRIVER_SYNC         yes -- eagletrack-driver-sync.service.ts
//   TRIGGER_SYNC        yes -- eagletrack-trigger-sync.service.ts
//
// This is the capability asymmetry the registry exists to express:
// Eagle Track has six, Cartrack has two, and no fleet-layer caller
// should learn that by name-checking the provider.

import {
  ProviderDescriptor,
  ProviderStatus,
  TelematicsCapability,
  PROVIDER_EAGLETRACK,
} from '../../providers/provider.types';
import {
  TelematicsProvider,
  ProviderDevice,
  TimeRange,
  ProviderSyncResult,
} from '../../providers/provider.contract';
import {
  CanonicalTelemetryPoint,
  normaliseNumber,
  normaliseBounded,
  normaliseHeading,
  compact,
} from '../../providers/canonical-telemetry';
import { ProviderError } from '../../providers/provider.errors';
import { eagletrackConfigRepository } from '../../repositories/eagletrack-config.repository';
import {
  eagletrackAdapter,
  parseEagleTrackDate,
  deriveEagleTrackUsername,
  plateCandidatesFromTracker,
} from './eagletrack.adapter';
import { EagleTrackTrackerStatus, EagleTrackTracker } from './eagletrack.types';

/** See the Cartrack provider for why the unmatched list is bounded. */
const UNMATCHED_SAMPLE_SIZE = 10;

export const EAGLETRACK_DESCRIPTOR: ProviderDescriptor = {
  providerId: PROVIDER_EAGLETRACK,
  name: 'Eagle Track',
  capabilities: [
    TelematicsCapability.LIVE_POSITION,
    TelematicsCapability.HISTORICAL_POSITION,
    TelematicsCapability.ALERTS,
    TelematicsCapability.FUEL_REPORT,
    TelematicsCapability.DRIVER_SYNC,
    TelematicsCapability.TRIGGER_SYNC,
  ],
};

/**
 * Projects an Eagle Track status onto a canonical point.
 *
 * Exported for direct unit testing.
 *
 * Timestamps go through `parseEagleTrackDate`, NOT the generic
 * `normaliseTimestamp`. The vendor emits "YYYY-MM-DD HH:mm:ss" with no
 * timezone designator, and the adapter's parser already encodes how this
 * deployment resolves that ambiguity. Two parsers for one vendor format
 * is how they drift.
 *
 * `io` is deliberately NOT unpacked here. Its numeric keys are mapped by
 * `eagletrack-io.map.ts`, which validates units -- io-199 is
 * "Fuel Consumption, L/h" and was once written to the L/100km field. The
 * full ingest path (mapStatusToTelematicsData) does that work; this
 * projection covers position and the signals available without the IO
 * catalogue, and carries `io` through as opaque providerMetadata.
 */
export function toCanonicalPoint(
  status: EagleTrackTrackerStatus,
  vehicleId?: string
): CanonicalTelemetryPoint | undefined {
  const recordedAt = parseEagleTrackDate(status.date);

  // No usable provider timestamp -> dropped, never stamped with server
  // time. See canonical-telemetry.ts and the adapter's staleness-guard
  // comment for why the two clocks must never be substituted.
  if (!recordedAt) return undefined;

  const latitude = normaliseBounded(status.lat, -90, 90);
  const longitude = normaliseBounded(status.lng, -180, 180);

  const position =
    latitude !== undefined && longitude !== undefined
      ? compact({
          latitude,
          longitude,
          speed: normaliseNumber(status.speed),
          heading: normaliseHeading(status.bearing),
          // api2 reports neither altitude nor horizontal accuracy.
          // Omitted, per Phase 1.
        })
      : undefined;

  return {
    providerId: PROVIDER_EAGLETRACK,
    externalDeviceId: status.uin,
    ...(vehicleId ? { vehicleId } : {}),
    recordedAt,
    ...(position ? { position: position as CanonicalTelemetryPoint['position'] } : {}),
    ...(status.io && Object.keys(status.io).length > 0
      ? { providerMetadata: { io: status.io, offline: status.offline } }
      : status.offline !== undefined
        ? { providerMetadata: { offline: status.offline } }
        : {}),
  };
}

export class EagleTrackProvider implements TelematicsProvider {
  readonly descriptor = EAGLETRACK_DESCRIPTOR;

  async listEnabledTenants(): Promise<string[]> {
    return eagletrackConfigRepository.listEnabledTenantIds();
  }

  /**
   * PHASE 2 (cron/worker migration): delegates to the existing adapter.
   *
   * `eagletrackAdapter.syncOrganization` carries the hardened pipeline --
   * query-param auth with token redaction, the text-then-parse client,
   * plate-candidate matching, the provider-clock staleness guard,
   * org-unit inheritance and the four sub-syncs. This method makes it
   * reachable without the caller naming Eagle Track.
   */
  async syncTenant(tenantId: string): Promise<ProviderSyncResult> {
    try {
      const result = await eagletrackAdapter.syncOrganization(tenantId);
      return {
        providerId: PROVIDER_EAGLETRACK,
        tenantId,
        // `matched` is documented as "matched to a vehicle AND ingested",
        // so it IS the ingested count for this provider.
        ingested: result.matched,
        matched: result.matched,
        unmatchedCount: result.unmatchedTrackers.length,
        unmatchedSample: result.unmatchedTrackers
          .slice(0, UNMATCHED_SAMPLE_SIZE)
          .map((t) => (typeof t === 'string' ? t : String((t as { uin?: string }).uin ?? ''))),
        errors: result.errors,
      };
    } catch (error) {
      throw this.translate(error, 'syncTenant');
    }
  }

  async getStatus(tenantId: string): Promise<ProviderStatus> {
    const config = await eagletrackConfigRepository.getConfig(tenantId);
    if (!config || !config.enabled) return 'not_configured';
    return config.lastSyncStatus === 'error' ? 'degraded' : 'enabled';
  }

  async testConnection(tenantId: string): Promise<boolean> {
    try {
      return await eagletrackAdapter.testConnection(tenantId);
    } catch (error) {
      throw this.translate(error, 'testConnection');
    }
  }

  async listDevices(tenantId: string): Promise<ProviderDevice[]> {
    const client = await eagletrackAdapter.buildClientFor(tenantId);
    if (!client) return [];

    try {
      const { trackers } = await client.getTrackersWithRefData();
      return trackers.map((tracker: EagleTrackTracker) => ({
        externalDeviceId: tracker.uin,
        name: tracker.name,
        // The ordered plate candidates the adapter already derives:
        // plate -> __platenumber -> name, first MATCH wins. Reused so
        // the contract face and the sync path cannot disagree about
        // which field holds the registration on a given deployment.
        registration: plateCandidatesFromTracker(tracker)[0]?.value,
        metadata: { model: tracker.model, belong: tracker.belong },
      }));
    } catch (error) {
      throw this.translate(error, 'listDevices');
    }
  }

  async getLiveTelemetry(tenantId: string): Promise<CanonicalTelemetryPoint[]> {
    const client = await eagletrackAdapter.buildClientFor(tenantId);
    if (!client) return [];

    try {
      const { trackers, refData } = await client.getTrackersWithRefData();
      const username = deriveEagleTrackUsername(trackers, refData);
      if (!username) return [];

      const statuses = await client.getLastForAll(username);

      const points: CanonicalTelemetryPoint[] = [];
      for (const status of statuses) {
        // Reuses the adapter's own tenant-scoped resolution, so the
        // contract face matches vehicles exactly as the sync path does.
        // resolveVehicleForUin returns a match record (vehicleId +
        // matchedBy + orgUnitId), not a bare id. Only the id belongs on
        // a canonical point -- `matchedBy` is Eagle Track's own
        // diagnostic vocabulary and `orgUnitId` is ownership, which the
        // ingestion layer re-derives from the vehicle record rather than
        // trusting from an adapter (Phase 0).
        const match = await eagletrackAdapter.resolveVehicleForUin(status.uin, tenantId);
        const point = toCanonicalPoint(status, match?.vehicleId);
        if (point) points.push(point);
      }
      return points;
    } catch (error) {
      throw this.translate(error, 'getLiveTelemetry');
    }
  }

  /**
   * Historical positions for one vehicle.
   *
   * Reads back from OUR store rather than re-querying the vendor. The
   * history service already ingests provider history idempotently
   * ($setOnInsert on the 4-tuple, backed by the Phase 1 unique index)
   * and deliberately bypasses the live pipeline so that replaying a
   * month does not re-fire geofences, re-raise alerts or notify
   * managers. Re-fetching here would either duplicate that work or
   * reintroduce exactly the replay it avoids.
   */
  async getHistoricalTelemetry(
    tenantId: string,
    vehicleId: string,
    range: TimeRange
  ): Promise<CanonicalTelemetryPoint[]> {
    const { telematicsRepository } = await import(
      '../../repositories/telematics.repository'
    );

    try {
      const readings = await telematicsRepository.getTelematicsHistory(
        vehicleId,
        range.from,
        range.to,
        tenantId
      );

      return readings
        .filter((r) => r.deviceId && r.timestamp)
        .map((r): CanonicalTelemetryPoint => {
          const externalDeviceId = externalIdFromStoredDeviceId(r.deviceId);
          const position =
            r.location &&
            typeof r.location.lat === 'number' &&
            typeof r.location.lng === 'number'
              ? compact({
                  latitude: r.location.lat,
                  longitude: r.location.lng,
                  speed: r.location.speed,
                  heading: r.location.heading,
                  altitude: r.location.altitude,
                  accuracy: r.location.accuracy,
                })
              : undefined;

          return {
            providerId: PROVIDER_EAGLETRACK,
            externalDeviceId,
            vehicleId,
            recordedAt: new Date(r.timestamp),
            ...(position
              ? { position: position as CanonicalTelemetryPoint['position'] }
              : {}),
            ...(r.engine && Object.keys(r.engine).length > 0 ? { engine: r.engine } : {}),
            ...(r.trip && Object.keys(r.trip).length > 0 ? { trip: r.trip } : {}),
            ...(r.fuel && Object.keys(r.fuel).length > 0 ? { fuel: r.fuel } : {}),
          } as CanonicalTelemetryPoint;
        });
    } catch (error) {
      throw this.translate(error, 'getHistoricalTelemetry');
    }
  }

  /**
   * Translates an Eagle Track failure into the neutral taxonomy.
   *
   * The client already classifies carefully -- `nonJsonBody` exists
   * because an invalid token arrives as an HTTP 200 login page, and
   * without that flag a bad credential surfaced as a platform OUTAGE.
   * That distinction is preserved here rather than flattened.
   *
   * Transport messages from this client are already errno-code-only and
   * the token is already redacted (Phase 0), so passing the message
   * through as providerDetail cannot leak a credential.
   */
  private translate(error: unknown, operation: string): ProviderError {
    if (error instanceof ProviderError) return error;

    const err = error as {
      message?: string;
      statusCode?: number;
      vendorErrorCode?: number | string;
      nonJsonBody?: boolean;
    };
    const raw = err?.message ?? String(error);
    const detail = raw.slice(0, 200);
    const lower = raw.toLowerCase();

    // A non-JSON body from a 2xx is the vendor's login page: the token
    // is wrong. Classified FIRST, because by status code alone it looks
    // like success.
    if (err?.nonJsonBody) {
      return new ProviderError(
        'authentication_failed',
        'Eagle Track rejected the stored token.',
        { providerId: PROVIDER_EAGLETRACK, operation, providerDetail: detail }
      );
    }

    const status = err?.statusCode;
    const category =
      status === 401 || lower.includes('token') || lower.includes('credential')
        ? 'authentication_failed'
        : status === 403
          ? 'authorization_failed'
          : status === 429
            ? 'rate_limited'
            : status !== undefined && status >= 500
              ? 'provider_unavailable'
              : lower.includes('json') || lower.includes('parse')
                ? 'malformed_response'
                : 'transient_error';

    return new ProviderError(category, `Eagle Track ${operation} failed.`, {
      providerId: PROVIDER_EAGLETRACK,
      operation,
      providerDetail: detail,
    });
  }
}

/**
 * Recovers a provider's own device id from a stored deviceId.
 *
 * TRANSITIONAL, and scoped to reading historical rows written before
 * Phase 2 added `externalDeviceId` to TelematicsDevice. New writes carry
 * the field; this only rescues old ones. Generic fleet code must never
 * do this -- that is the leak Phase 2 removes.
 */
function externalIdFromStoredDeviceId(deviceId: string): string {
  const prefix = `${PROVIDER_EAGLETRACK}-`;
  return deviceId.startsWith(prefix) ? deviceId.slice(prefix.length) : deviceId;
}

export const eagletrackProvider = new EagleTrackProvider();
