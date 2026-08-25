// modules/telematics/adapters/cartrack/cartrack.provider.ts
//
// PHASE 2 -- Cartrack behind the canonical contract.
//
// ---------------------------------------------------------------------
// WHAT THIS IS AND IS NOT
// ---------------------------------------------------------------------
// This is the CONTRACT FACE of the Cartrack integration. It does not
// replace `cartrack.adapter.ts`, which keeps the working sync/matching/
// ingest pipeline that Phases 0 and 1 hardened. Rewriting that to route
// through the contract would mean re-deriving vehicle matching, device
// registration, org-unit inheritance and the Phase 1 absent-vs-zero
// mapping -- for no behavioural gain and considerable risk.
//
// Instead this class exposes Cartrack THROUGH the contract, so:
//
//   * generic fleet code can hold a `TelematicsProvider` and never know
//     which vendor it has;
//   * capabilities are declared rather than assumed;
//   * Cartrack's errors are translated into the neutral taxonomy at this
//     boundary instead of arriving as untyped strings.
//
// The existing `cartrackAdapter.syncOrganization()` remains the polling
// entry point (cron + worker), unchanged. Both paths converge on
// `telematicsService.ingestTelematicsData`, so there is exactly one
// ingestion pipeline, which is the Phase 2 requirement -- not that every
// caller be rewritten to use the new face on day one.
//
// ---------------------------------------------------------------------
// CAPABILITIES -- WHAT CARTRACK ACTUALLY DOES HERE
// ---------------------------------------------------------------------
// Declared from the code that exists, not from Cartrack's product sheet:
//
//   LIVE_POSITION       yes -- CartrackApiClient.getFleetStatus()
//   ALERTS              yes -- CartrackVehicleStatus.events[]
//   HISTORICAL_POSITION NO  -- no client method, no route, nothing
//   FUEL_REPORT         NO
//   DRIVER_SYNC         NO
//   TRIGGER_SYNC        NO
//
// The four absent capabilities are absent from `capabilities` AND their
// methods are not implemented. Declaring one and throwing would be
// worse than not declaring it: a caller that checked the descriptor
// would be told yes and then fail.

import {
  ProviderDescriptor,
  ProviderStatus,
  TelematicsCapability,
  PROVIDER_CARTRACK,
} from '../../providers/provider.types';
import {
  TelematicsProvider,
  ProviderDevice,
  ProviderSyncResult,
} from '../../providers/provider.contract';
import {
  CanonicalTelemetryPoint,
  CanonicalEvent,
  normaliseTimestamp,
  normaliseNumber,
  normaliseBounded,
  normaliseHeading,
  normaliseIgnition,
  compact,
} from '../../providers/canonical-telemetry';
import { ProviderError } from '../../providers/provider.errors';
import { cartrackConfigRepository } from '../../repositories/cartrack-config.repository';
import { vehicleRepository } from '@/modules/vehicles/repositories/vehicle.repository';
import { CartrackApiClient } from './cartrack-api.client';
import { CartrackVehicleStatus, CartrackEvent } from './cartrack.types';

/**
 * How many unmatched identifiers a sync result carries.
 *
 * Bounded because a tenant with a thousand unmatched devices must not
 * put a thousand identifiers into a log line -- but an operator
 * diagnosing a mapping problem needs to see a few real examples.
 */
const UNMATCHED_SAMPLE_SIZE = 10;

export const CARTRACK_DESCRIPTOR: ProviderDescriptor = {
  providerId: PROVIDER_CARTRACK,
  name: 'Cartrack',
  capabilities: [
    TelematicsCapability.LIVE_POSITION,
    TelematicsCapability.ALERTS,
  ],
};

/**
 * Maps one Cartrack status onto a canonical point.
 *
 * Exported for direct unit testing -- the normalisation is the part
 * worth pinning, and reaching it through a live client would test the
 * transport instead.
 *
 * ABSENT IS NOT ZERO throughout, matching the Phase 1 fix in
 * cartrack.adapter.ts. Cartrack supplies only: latitude, longitude,
 * speed, heading, position_date, ignition_on, and optionally altitude,
 * odometer_km, fuel_level_percent. Everything else is omitted.
 *
 * Trip aggregates are deliberately NOT derived: the status payload is a
 * point-in-time fix with no trip aggregation, so mapping instantaneous
 * speed onto averageSpeed/maxSpeed reported a trip maximum of 0 for any
 * vehicle sampled while stationary.
 */
export function toCanonicalPoint(
  status: CartrackVehicleStatus,
  vehicleId?: string
): CanonicalTelemetryPoint | undefined {
  const recordedAt = normaliseTimestamp(status.position?.position_date);

  // A fix with no usable timestamp is DROPPED, not stamped with server
  // time. Substituting `new Date()` would make a replayed or malformed
  // reading look like the freshest fix in the fleet and win every
  // "is this newer than what I hold" comparison.
  if (!recordedAt) return undefined;

  const latitude = normaliseBounded(status.position?.latitude, -90, 90);
  const longitude = normaliseBounded(status.position?.longitude, -180, 180);

  const position =
    latitude !== undefined && longitude !== undefined
      ? compact({
          latitude,
          longitude,
          speed: normaliseNumber(status.position?.speed),
          heading: normaliseHeading(status.position?.heading),
          altitude: normaliseNumber(status.position?.altitude),
          // Cartrack's payload carries no horizontal-accuracy field at
          // all. Omitted rather than 0 -- 0 reads as a PERFECT fix.
        })
      : undefined;

  return {
    providerId: PROVIDER_CARTRACK,
    externalDeviceId: status.terminal_serial,
    ...(vehicleId ? { vehicleId } : {}),
    recordedAt,
    ...(position ? { position: position as CanonicalTelemetryPoint['position'] } : {}),
    ...(() => {
      const engine = compact({
        ignition: normaliseIgnition(status.ignition_on),
        fuelLevel: normaliseBounded(status.fuel_level_percent, 0, 100),
      });
      return engine ? { engine } : {};
    })(),
    ...(() => {
      const trip = compact({ odometer: normaliseNumber(status.odometer_km) });
      return trip ? { trip } : {};
    })(),
    ...(() => {
      const events = (status.events ?? [])
        .map(toCanonicalEvent)
        .filter((e): e is CanonicalEvent => e !== undefined);
      return events.length > 0 ? { events } : {};
    })(),
  };
}

/**
 * Maps a Cartrack event onto the platform taxonomy.
 *
 * Anything without a faithful equivalent becomes 'vendor' rather than
 * being forced into a near-miss. The precedent is Eagle Track trigger
 * type 4 (Stop), deliberately not mapped to 'idle' because idle means
 * engine-running-while-stationary everywhere in this codebase and
 * misfiling it would inflate the idle metric with parked vehicles.
 */
export function toCanonicalEvent(event: CartrackEvent): CanonicalEvent | undefined {
  const occurredAt = normaliseTimestamp(event.event_date);
  if (!occurredAt) return undefined;

  const type: CanonicalEvent['type'] =
    event.event_type === 'speeding'
      ? 'speeding'
      : event.event_type === 'harsh_braking'
        ? 'harsh_braking'
        : event.event_type === 'harsh_acceleration'
          ? 'harsh_acceleration'
          : event.event_type === 'geofence'
            ? 'geofence'
            : 'vendor';

  // Severity is derived from the event type, not invented per-event:
  // Cartrack's feed carries no severity field, and a random or
  // round-robin severity is the F-18 defect in a new place.
  const severity: CanonicalEvent['severity'] =
    type === 'speeding' || event.event_type === 'panic' ? 'high' : 'medium';

  return {
    type,
    severity,
    message: event.description || `Cartrack event: ${event.event_type}`,
    occurredAt,
    ...(normaliseNumber(event.value) !== undefined
      ? { value: normaliseNumber(event.value) }
      : {}),
    ...(normaliseNumber(event.threshold) !== undefined
      ? { threshold: normaliseNumber(event.threshold) }
      : {}),
  };
}

export class CartrackProvider implements TelematicsProvider {
  readonly descriptor = CARTRACK_DESCRIPTOR;

  private async buildClient(tenantId: string): Promise<CartrackApiClient | null> {
    const config = await cartrackConfigRepository.getResolvedConfig(tenantId);
    if (!config || !config.enabled) return null;

    return new CartrackApiClient({
      baseUrl: config.baseUrl,
      accountId: config.accountId,
      apiKey: config.apiKey,
      apiSecret: config.apiSecret,
    });
  }

  async listEnabledTenants(): Promise<string[]> {
    return cartrackConfigRepository.listEnabledTenantIds();
  }

  /**
   * PHASE 2 (cron/worker migration): delegates to the existing adapter.
   *
   * `cartrackAdapter.syncOrganization` carries the working pipeline that
   * Phases 0 and 1 hardened -- tenant-scoped plate matching, device
   * registration, and the absent-vs-zero mapping. Re-deriving it here
   * would risk regressions for no behavioural gain; this method's job is
   * to make it reachable WITHOUT the caller naming Cartrack.
   *
   * The vendor-shaped result is projected onto ProviderSyncResult so a
   * scheduler never sees `unmatchedRegistrations` (Cartrack's word) or
   * `unmatchedTrackers` (Eagle Track's).
   */
  async syncTenant(tenantId: string): Promise<ProviderSyncResult> {
    const { cartrackAdapter } = await import('./cartrack.adapter');

    try {
      const result = await cartrackAdapter.syncOrganization(tenantId);
      return {
        providerId: PROVIDER_CARTRACK,
        tenantId,
        ingested: result.matched,
        matched: result.matched,
        unmatchedCount: result.unmatchedRegistrations.length,
        unmatchedSample: result.unmatchedRegistrations.slice(0, UNMATCHED_SAMPLE_SIZE),
        errors: result.errors,
      };
    } catch (error) {
      throw this.translate(error, tenantId, 'syncTenant');
    }
  }

  async getStatus(tenantId: string): Promise<ProviderStatus> {
    const config = await cartrackConfigRepository.getConfig(tenantId);
    if (!config || !config.enabled) return 'not_configured';
    return config.lastSyncStatus === 'error' ? 'degraded' : 'enabled';
  }

  async testConnection(tenantId: string): Promise<boolean> {
    const client = await this.buildClient(tenantId);
    if (!client) return false;

    try {
      return await client.verifyCredentials();
    } catch (error) {
      throw this.translate(error, tenantId, 'testConnection');
    }
  }

  async listDevices(tenantId: string): Promise<ProviderDevice[]> {
    const client = await this.buildClient(tenantId);
    if (!client) return [];

    try {
      const statuses = await client.getFleetStatus();
      return statuses.map((s) => ({
        externalDeviceId: s.terminal_serial,
        registration: s.registration,
        metadata: { source: PROVIDER_CARTRACK },
      }));
    } catch (error) {
      throw this.translate(error, tenantId, 'listDevices');
    }
  }

  async getLiveTelemetry(tenantId: string): Promise<CanonicalTelemetryPoint[]> {
    const client = await this.buildClient(tenantId);
    if (!client) return [];

    let statuses: CartrackVehicleStatus[];
    try {
      statuses = await client.getFleetStatus();
    } catch (error) {
      throw this.translate(error, tenantId, 'getLiveTelemetry');
    }

    const points: CanonicalTelemetryPoint[] = [];

    for (const status of statuses) {
      // Vehicle matching stays tenant-scoped and exact, exactly as the
      // existing adapter does it. A registration that matches nothing is
      // returned WITHOUT a vehicleId rather than dropped, so the caller
      // can report it -- guessing which internal vehicle a stray
      // registration belongs to is the class of guess this codebase
      // consistently refuses to make.
      const vehicle = status.registration
        ? await vehicleRepository.findByLicensePlate(status.registration, tenantId)
        : null;

      const point = toCanonicalPoint(status, vehicle?._id ?? undefined);
      if (point) points.push(point);
    }

    return points;
  }

  /**
   * Translates a Cartrack transport failure into the neutral taxonomy.
   *
   * Cartrack's client throws plain Errors with a message, so this is
   * necessarily message-shape based -- deliberately conservative:
   * anything not confidently classified becomes `transient_error`, which
   * is retryable. The alternative default (`provider_unavailable`) would
   * be indistinguishable in effect, and defaulting to
   * `authentication_failed` would make an operator rotate working
   * credentials to fix a network blip.
   *
   * The message is passed through as `providerDetail` for logs only and
   * never becomes part of the fleet-facing contract.
   */
  private translate(error: unknown, tenantId: string, operation: string): ProviderError {
    if (error instanceof ProviderError) return error;

    const raw = error instanceof Error ? error.message : String(error);
    const detail = raw.slice(0, 200);
    const lower = raw.toLowerCase();

    const category =
      lower.includes('401') || lower.includes('unauthor') || lower.includes('credential')
        ? 'authentication_failed'
        : lower.includes('403') || lower.includes('forbidden')
          ? 'authorization_failed'
          : lower.includes('429') || lower.includes('rate limit')
            ? 'rate_limited'
            : lower.includes('json') || lower.includes('parse') || lower.includes('unexpected token')
              ? 'malformed_response'
              : lower.includes('timeout') || lower.includes('abort') || lower.includes('econn')
                ? 'transient_error'
                : lower.includes('500') || lower.includes('502') || lower.includes('503')
                  ? 'provider_unavailable'
                  : 'transient_error';

    return new ProviderError(category, `Cartrack ${operation} failed.`, {
      providerId: PROVIDER_CARTRACK,
      operation,
      providerDetail: detail,
    });
  }
}

export const cartrackProvider = new CartrackProvider();
