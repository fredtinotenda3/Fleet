// modules/telematics/providers/provider.contract.ts
//
// PHASE 2 -- the interface every telematics provider implements.
//
// ---------------------------------------------------------------------
// DESIGN NOTES
// ---------------------------------------------------------------------
// SCOPED TO WHAT THE PLATFORM ACTUALLY CALLS. The methods below exist
// because the current codebase already performs each of these
// operations against at least one provider. Nothing speculative: an
// unused capability cannot be tested against a real vendor and becomes
// a lie the moment somebody trusts it.
//
// TENANT-ID, NOT TenantContext. Every method takes `tenantId: string`
// because providers are polled by CRON JOBS and workers, which have no
// request context and no acting user -- see workers/ and
// app/api/cron/eagletrack-sync. Passing a TenantContext would force
// every background caller to fabricate one, and a fabricated context is
// how org-unit scope gets lost. Ownership resolution stays where Phase 0
// put it: the ingestion layer, from the vehicle record. An adapter
// cannot express a tenant on a CanonicalTelemetryPoint at all.
//
// CAPABILITY BEFORE CALL. Optional methods are optional in the TypeScript
// sense: a provider that cannot do something does not implement it, and
// `descriptor.capabilities` says so declaratively. Callers ask the
// registry, not the provider. An adapter that implements a method it
// cannot honour must throw `unsupportedCapability` rather than return
// an empty array -- an empty result is indistinguishable from "the fleet
// reported nothing", which is a real and different answer.
//
// NO RAW VENDOR TYPES CROSS THIS BOUNDARY. Every return value is
// canonical. Vendor parsing, pagination, retry, date-format probing and
// unit validation all live inside the adapter.

import {
  CanonicalTelemetryPoint,
  CanonicalEvent,
} from './canonical-telemetry';
import { ProviderDescriptor, ProviderStatus, TelematicsProviderId } from './provider.types';

/** A device as the PROVIDER describes it, before any vehicle matching. */
export interface ProviderDevice {
  /** The provider's own identifier. Verbatim. */
  externalDeviceId: string;
  /** Provider's display name for the device, if any. */
  name?: string;
  /**
   * Registration/plate as the provider holds it, when available.
   *
   * The join key back to Vehicle.license_plate. Kept as free text: it is
   * a LOOKUP KEY, never a value we write. Matching is the ingestion
   * layer's job, against the tenant's own vehicles.
   */
  registration?: string;
  /** Whether the provider considers the device currently reporting. */
  online?: boolean;
  /** Provider-specific extras. Opaque to fleet code. */
  metadata?: Record<string, unknown>;
}

/** A time range for historical queries. Half-open: [from, to). */
export interface TimeRange {
  from: Date;
  to: Date;
}

/**
 * The outcome of one poll-and-ingest cycle for one tenant.
 *
 * PHASE 2 (cron/worker migration): the two adapters return DIFFERENT
 * result shapes -- `CartrackSyncResult` counts `unmatchedRegistrations`,
 * `EagleTrackSyncResult` counts `unmatchedTrackers` plus
 * `trackersWithoutFix` and `matchedBy`. Both are meaningful to their own
 * vendor and neither is meaningful to a scheduler.
 *
 * This is the neutral projection the worker logs and acts on. Vendor
 * detail is not destroyed -- it stays on the adapter's own result, which
 * the vendor-specific admin endpoints still return verbatim -- it simply
 * does not reach generic code.
 *
 * `unmatched` is a COUNT plus a bounded sample rather than the full
 * list: a tenant with a thousand unmatched trackers should not put a
 * thousand identifiers into a log line, but an operator diagnosing a
 * mapping problem needs to see a few.
 */
export interface ProviderSyncResult {
  providerId: TelematicsProviderId;
  tenantId: string;
  /** Readings ingested through telematicsService.ingestTelematicsData. */
  ingested: number;
  /** Provider devices matched to a vehicle in this tenant. */
  matched: number;
  /** Provider devices that matched no vehicle. */
  unmatchedCount: number;
  /** Bounded sample of unmatched provider identifiers, for diagnosis. */
  unmatchedSample: string[];
  /**
   * Errors the adapter handled internally.
   *
   * Non-empty does NOT mean the sync failed: both adapters convert
   * per-vehicle API failures into entries here and continue, so a sweep
   * can be partially successful. A thrown ProviderError means the whole
   * cycle failed.
   */
  errors: string[];
}

/**
 * The contract.
 *
 * Implemented by CartrackProvider, EagleTrackProvider, and
 * MockTelematicsProvider. The fleet layer holds only this type.
 */
export interface TelematicsProvider {
  /** Static identity and capabilities. Never per-tenant. */
  readonly descriptor: ProviderDescriptor;

  /**
   * Whether this provider is usable for this tenant right now.
   *
   * Separate from capability: 'not_configured' means an admin has not
   * entered credentials, which is an admin task, not a product
   * limitation. Must not throw for an unconfigured tenant -- that is a
   * normal state, not an error.
   */
  getStatus(tenantId: string): Promise<ProviderStatus>;

  /**
   * Verify stored credentials without pulling a full payload.
   *
   * Returns false for "credentials rejected". Throws ProviderError for
   * anything else -- the distinction matters because Eagle Track's
   * invalid-token response arrives as an HTTP 200 login page, and
   * conflating it with an outage was a real incident here.
   */
  testConnection(tenantId: string): Promise<boolean>;

  /** The provider's device roster for this tenant. */
  listDevices(tenantId: string): Promise<ProviderDevice[]>;

  /**
   * Tenants that have this provider configured AND enabled.
   *
   * PHASE 2 (cron/worker migration): exists so a scheduler can sweep
   * without importing a vendor's config repository. The worker
   * previously called `cartrackConfigRepository.listEnabledTenantIds()`
   * and `eagletrackConfigRepository.listEnabledTenantIds()` by name,
   * which meant adding a third provider required editing the worker --
   * one of the generic-code edits Phase 2 exists to remove.
   *
   * Returns only enabled tenants rather than every organization: most
   * tenants have no integration configured at all, and there is no
   * reason to pay for a no-op on every org on every run.
   */
  listEnabledTenants(): Promise<string[]>;

  /**
   * Poll this provider for one tenant and ingest what it returns.
   *
   * THE POLLING ENTRY POINT. Every scheduled sweep, manual trigger and
   * read-through refresh goes through here.
   *
   * Implementations MUST route their writes through
   * `telematicsService.ingestTelematicsData` so that alerting,
   * geofencing, org-unit inheritance and the WebSocket broadcast happen
   * exactly once, in one place, for every provider. An adapter that
   * wrote to the repository directly would silently bypass all of it.
   *
   * Must not throw for a tenant that is not configured -- that is a
   * normal state. Returns a zero-count result instead.
   */
  syncTenant(tenantId: string): Promise<ProviderSyncResult>;

  /**
   * Current position/telemetry for the whole fleet.
   *
   * `vehicleId` is populated only where the adapter matched a device to
   * a vehicle in this tenant. Unmatched points are still returned, so
   * the caller can report them rather than have them silently vanish.
   */
  getLiveTelemetry(tenantId: string): Promise<CanonicalTelemetryPoint[]>;

  /**
   * Historical positions for one vehicle over a range.
   *
   * Optional: requires TelematicsCapability.HISTORICAL_POSITION.
   */
  getHistoricalTelemetry?(
    tenantId: string,
    vehicleId: string,
    range: TimeRange
  ): Promise<CanonicalTelemetryPoint[]>;

  /**
   * Provider-raised events over a range.
   *
   * Optional: requires TelematicsCapability.ALERTS.
   */
  getEvents?(tenantId: string, range: TimeRange): Promise<CanonicalEvent[]>;
}

/**
 * Narrowing helpers.
 *
 * Used instead of `if (provider.getHistoricalTelemetry)` at call sites
 * so the capability check and the method check cannot drift apart -- a
 * provider that declares HISTORICAL_POSITION but does not implement the
 * method is a bug these surface immediately.
 */
export function hasHistoricalTelemetry(
  provider: TelematicsProvider
): provider is TelematicsProvider &
  Required<Pick<TelematicsProvider, 'getHistoricalTelemetry'>> {
  return typeof provider.getHistoricalTelemetry === 'function';
}

export function hasEvents(
  provider: TelematicsProvider
): provider is TelematicsProvider & Required<Pick<TelematicsProvider, 'getEvents'>> {
  return typeof provider.getEvents === 'function';
}
