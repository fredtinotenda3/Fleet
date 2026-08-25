// modules/telematics/providers/mock/mock.provider.ts
//
// PHASE 2 -- the third provider, and the proof.
//
// ---------------------------------------------------------------------
// WHY THIS FILE IS THE POINT OF PHASE 2
// ---------------------------------------------------------------------
// Before Phase 2, adding a provider meant editing:
//
//   live-map.service.ts        providerSourceFor(), and its refresh block
//   live-map.types.ts          the closed LiveMapDataSource union
//   telematics.repository.ts   the `^eagletrack-` regex device lookup
//   app/api/telematics/**      a parallel vendor-named route tree
//   indexes.telematics-*.ts    vendor-specific collections
//   module-scope.registry.ts   those collections again
//
// None of that is provider-adapter work. It is generic fleet code being
// edited because a vendor was added -- the exact coupling this phase
// exists to remove.
//
// This provider is the falsifiable test of whether that worked. It is a
// FULL implementation of TelematicsProvider that touches no vendor API,
// no configuration collection, and no credential store. If it can be
// registered and driven end-to-end through the shared pipeline without
// any generic fleet file naming it, the abstraction holds. If it cannot,
// the abstraction is decoration.
//
// See tests/security/telematics-provider-extensibility.spec.ts, which
// asserts exactly that -- including a source-level check that no file
// outside modules/telematics/providers/mock/ mentions this provider.
//
// ---------------------------------------------------------------------
// DELIBERATELY NOT REGISTERED IN PRODUCTION
// ---------------------------------------------------------------------
// provider.bootstrap.ts registers Cartrack and Eagle Track only. A
// provider that fabricates positions must never be resolvable in a real
// deployment: the platform's whole value proposition is that a reading
// means something, and a registry entry is exactly the kind of thing
// that gets copied into production "temporarily". Tests register it
// explicitly against a registry they control.
//
// ---------------------------------------------------------------------
// IT OBEYS THE SAME RULES IT IS TESTING
// ---------------------------------------------------------------------
// Notably: absent stays absent. The fixtures below omit fields rather
// than zeroing them, so a test written against this provider cannot
// accidentally assert that fabricated zeros are acceptable -- which is
// the Phase 1 defect, and precisely the sort of thing a lax test double
// would quietly re-legitimise.

import {
  ProviderDescriptor,
  ProviderStatus,
  TelematicsCapability,
} from '../provider.types';
import {
  TelematicsProvider,
  ProviderDevice,
  TimeRange,
  ProviderSyncResult,
} from '../provider.contract';
import {
  CanonicalTelemetryPoint,
  CanonicalEvent,
} from '../canonical-telemetry';
import { ProviderError } from '../provider.errors';

export const MOCK_PROVIDER_ID = 'mock-provider';

export const MOCK_DESCRIPTOR: ProviderDescriptor = {
  providerId: MOCK_PROVIDER_ID,
  name: 'Mock Telematics Provider',
  // A deliberately DIFFERENT capability set from both real providers:
  // live positions and events, but no fuel report, no driver sync, no
  // trigger sync. If a caller has hard-coded an assumption that every
  // provider does what Eagle Track does, this is what surfaces it.
  capabilities: [
    TelematicsCapability.LIVE_POSITION,
    TelematicsCapability.HISTORICAL_POSITION,
    TelematicsCapability.ALERTS,
  ],
};

export interface MockProviderSeed {
  /** Devices this provider "knows about", keyed by tenant. */
  devicesByTenant?: Record<string, ProviderDevice[]>;
  /** Canonical points returned by getLiveTelemetry, keyed by tenant. */
  liveByTenant?: Record<string, CanonicalTelemetryPoint[]>;
  /** Historical points, keyed by `${tenantId}:${vehicleId}`. */
  historyByVehicle?: Record<string, CanonicalTelemetryPoint[]>;
  /** Events, keyed by tenant. */
  eventsByTenant?: Record<string, CanonicalEvent[]>;
  /** Tenants for which this provider reports itself configured. */
  enabledTenants?: string[];
  /** Force a specific failure, to exercise the neutral error model. */
  failWith?: ProviderError;
}

/**
 * A fully-functional provider backed by in-memory fixtures.
 *
 * Constructed with a seed rather than reading module-level state, so two
 * tests running in the same process cannot see each other's data.
 */
export class MockTelematicsProvider implements TelematicsProvider {
  readonly descriptor = MOCK_DESCRIPTOR;

  /** Call log, so a test can assert the pipeline actually reached the provider. */
  readonly calls: Array<{ method: string; tenantId: string }> = [];

  constructor(private readonly seed: MockProviderSeed = {}) {}

  private record(method: string, tenantId: string): void {
    this.calls.push({ method, tenantId });
    if (this.seed.failWith) throw this.seed.failWith;
  }

  async getStatus(tenantId: string): Promise<ProviderStatus> {
    // No throw for an unconfigured tenant -- that is a normal state, not
    // an error, and the contract says so.
    const enabled = this.seed.enabledTenants ?? [];
    return enabled.includes(tenantId) ? 'enabled' : 'not_configured';
  }

  async testConnection(tenantId: string): Promise<boolean> {
    this.record('testConnection', tenantId);
    return (this.seed.enabledTenants ?? []).includes(tenantId);
  }

  async listDevices(tenantId: string): Promise<ProviderDevice[]> {
    this.record('listDevices', tenantId);
    return this.seed.devicesByTenant?.[tenantId] ?? [];
  }

  async listEnabledTenants(): Promise<string[]> {
    return this.seed.enabledTenants ?? [];
  }

  /**
   * Ingests the seeded live points.
   *
   * Deliberately does NOT write anywhere: a test double that reached the
   * database would make every suite using it require Mongo. It reports
   * the counts a real provider would, so a scheduler driving it exercises
   * the same result-handling path.
   */
  async syncTenant(tenantId: string): Promise<ProviderSyncResult> {
    this.record('syncTenant', tenantId);

    const points = this.seed.liveByTenant?.[tenantId] ?? [];
    const unmatched = points.filter((p) => !p.vehicleId);

    return {
      providerId: MOCK_PROVIDER_ID,
      tenantId,
      ingested: points.length - unmatched.length,
      matched: points.length - unmatched.length,
      unmatchedCount: unmatched.length,
      unmatchedSample: unmatched.map((p) => p.externalDeviceId).slice(0, 10),
      errors: [],
    };
  }

  async getLiveTelemetry(tenantId: string): Promise<CanonicalTelemetryPoint[]> {
    this.record('getLiveTelemetry', tenantId);
    return this.seed.liveByTenant?.[tenantId] ?? [];
  }

  async getHistoricalTelemetry(
    tenantId: string,
    vehicleId: string,
    _range: TimeRange
  ): Promise<CanonicalTelemetryPoint[]> {
    this.record('getHistoricalTelemetry', tenantId);
    return this.seed.historyByVehicle?.[`${tenantId}:${vehicleId}`] ?? [];
  }

  async getEvents(tenantId: string, _range: TimeRange): Promise<CanonicalEvent[]> {
    this.record('getEvents', tenantId);
    return this.seed.eventsByTenant?.[tenantId] ?? [];
  }
}

/**
 * A canonical point in the mock provider's shape.
 *
 * Every measurement is OPTIONAL and omitted unless the caller asks for
 * it, so a fixture built with this helper cannot accidentally assert
 * that a fabricated zero is acceptable.
 */
export function mockPoint(
  overrides: Partial<CanonicalTelemetryPoint> & {
    externalDeviceId: string;
    recordedAt: Date;
  }
): CanonicalTelemetryPoint {
  return {
    providerId: MOCK_PROVIDER_ID,
    ...overrides,
  };
}
