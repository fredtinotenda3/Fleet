// modules/telematics/providers/provider.types.ts
//
// PHASE 2 -- provider identity and capability, as first-class data.
//
// ---------------------------------------------------------------------
// WHAT THIS REPLACES
// ---------------------------------------------------------------------
// Provider identity was inferred from a STRING PREFIX on the device id:
//
//   live-map.service.ts::providerSourceFor
//     deviceId.startsWith('eagletrack-') -> 'eagletrack'
//     deviceId.startsWith('demo-')       -> 'demo'
//     otherwise                          -> 'cartrack'   <-- the bug
//
//   telematics.repository.ts::getEagleTrackUinForVehicle
//     { deviceId: { $regex: '^eagletrack-' } }
//     uin = deviceId.slice('eagletrack-'.length)
//
// Both sites already carried a comment saying the correct fix was a
// first-class provider field, deferred because it would need a backfill.
// Phase 2 does it, with the backfill (scripts/backfill-device-provider.ts).
//
// The prefix scheme had three distinct defects:
//
//   1. UNKNOWN DEFAULTED TO CARTRACK. A device registered through the
//      generic ingest endpoint -- nothing to do with Cartrack -- was
//      labelled Cartrack in the UI and in every consumer of `source`. A
//      third provider would be labelled Cartrack until somebody edited
//      that function. Silent, and wrong in the direction that looks
//      plausible.
//   2. THREE CONCEPTS IN ONE STRING. `eagletrack-1234` collapses the
//      provider, the provider's own device identifier, and our storage
//      key. Anything that needs one of the three has to parse, and a
//      provider whose ids contain a hyphen breaks the parse.
//   3. IDENTITY BY CONVENTION. Nothing enforced the prefix. A device
//      registered without it simply became Cartrack's.
//
// ---------------------------------------------------------------------
// WHY providerId IS A STRING UNION AND NOT AN ENUM
// ---------------------------------------------------------------------
// Providers are registered at runtime (see provider.registry.ts) and a
// deployment may register a subset. A TypeScript enum would imply a
// closed set known at compile time, which is exactly the assumption
// Phase 2 exists to remove -- and `LiveMapDataSource` being a closed
// union is one of the leaks being fixed. The registry, not the type
// system, is the authority on which providers exist; unknown ids fail
// there, loudly, rather than being unrepresentable here.

/**
 * Stable identifier for a telematics provider.
 *
 * Lower-case, hyphen-free, and never derived from a device id. Used as
 * the registry key and stored verbatim on TelematicsDevice.providerId.
 */
export type TelematicsProviderId = string;

/** The two providers this deployment ships with. Not an exhaustive set. */
export const PROVIDER_CARTRACK: TelematicsProviderId = 'cartrack';
export const PROVIDER_EAGLETRACK: TelematicsProviderId = 'eagletrack';

/**
 * Non-provider sources that can appear on a stored reading.
 *
 * `demo` is the simulator (demo-simulator.service.ts), which writes
 * through the same ingestion pipeline as a real provider so the live map
 * has something to show on an unconfigured tenant. It is deliberately
 * NOT a registered provider: it has no credentials, no external API, and
 * must never be selectable as one.
 *
 * `unknown` is what a reading gets when its device carries no providerId
 * and its id matches no known prefix. It exists so that "we do not know"
 * is representable -- previously this case silently became 'cartrack'.
 */
export const SOURCE_DEMO = 'demo';
export const SOURCE_UNKNOWN = 'unknown';

/**
 * A capability the platform actually uses today.
 *
 * Deliberately small. Every member maps to something the fleet layer
 * genuinely calls; speculative capabilities (video, CAN diagnostics,
 * remote immobilisation) are absent because an unused capability cannot
 * be tested against a real provider and becomes a lie the moment someone
 * trusts it.
 */
export enum TelematicsCapability {
  /** Poll the provider for the fleet's current positions. */
  LIVE_POSITION = 'live_position',
  /** Fetch a vehicle's positions over a past time range. */
  HISTORICAL_POSITION = 'historical_position',
  /** Fetch provider-raised events/alerts (overspeed, geofence, ...). */
  ALERTS = 'alerts',
  /** Fetch a fuel consumption report for a vehicle over a range. */
  FUEL_REPORT = 'fuel_report',
  /** Fetch the provider's driver roster for linking. */
  DRIVER_SYNC = 'driver_sync',
  /** Fetch provider-side trigger/geofence definitions. */
  TRIGGER_SYNC = 'trigger_sync',
}

/**
 * Whether a provider is usable right now.
 *
 * Separate from capability: a provider may be fully capable and simply
 * not configured for this tenant. Callers must distinguish "this
 * provider cannot do that" (capability) from "this provider is not set
 * up here" (status), because the remedies are different -- one is a
 * product limitation, the other is an admin task.
 */
export type ProviderStatus =
  /** Registered, credentials present and enabled for the tenant. */
  | 'enabled'
  /** Registered but not configured/enabled for this tenant. */
  | 'not_configured'
  /** Configured but the last interaction failed. */
  | 'degraded';

/**
 * What the platform knows about a provider without talking to it.
 *
 * Static per provider (not per tenant) -- tenant-specific state is
 * `ProviderStatus`, resolved separately, because a descriptor is
 * compile-time knowledge about the integration and status is a
 * per-tenant runtime fact.
 */
export interface ProviderDescriptor {
  providerId: TelematicsProviderId;
  /** Human label for admin UI and logs. Never used as a key. */
  name: string;
  capabilities: readonly TelematicsCapability[];
}

/** Does this provider advertise this capability? */
export function supportsCapability(
  descriptor: ProviderDescriptor,
  capability: TelematicsCapability
): boolean {
  return descriptor.capabilities.includes(capability);
}
