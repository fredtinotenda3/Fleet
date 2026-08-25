// modules/telematics/providers/provider.resolve.ts
//
// PHASE 2 -- the fleet layer's entry point to providers.
//
// Everything outside modules/telematics/adapters/ and
// modules/telematics/providers/ goes through these functions. They
// guarantee the registry is populated before a lookup, so no caller has
// to remember to bootstrap.

import { providerRegistry } from './provider.registry';
import { registerTelematicsProviders } from './provider.bootstrap';
import { TelematicsProvider } from './provider.contract';
import {
  ProviderDescriptor,
  TelematicsCapability,
  SOURCE_DEMO,
  SOURCE_UNKNOWN,
} from './provider.types';

/**
 * Resolves a provider by id, or throws ProviderError.
 *
 * THE FAIL-CLOSED PATH. An unknown id stops the operation. It is never
 * Cartrack, which is what `providerSourceFor`'s `return 'cartrack'`
 * silently made it before Phase 2.
 */
export function getTelematicsProvider(providerId: string): TelematicsProvider {
  registerTelematicsProviders();
  return providerRegistry.resolve(providerId);
}

/** Resolves a provider by id, or undefined. For callers that must not throw. */
export function tryGetTelematicsProvider(
  providerId: string
): TelematicsProvider | undefined {
  registerTelematicsProviders();
  return providerRegistry.tryResolve(providerId);
}

/** Descriptors for every registered provider — for admin surfaces. */
export function listTelematicsProviders(): ProviderDescriptor[] {
  registerTelematicsProviders();
  return providerRegistry.listDescriptors();
}

/**
 * Does this provider support this capability?
 *
 * The replacement for `if (providerId === 'eagletrack')`. Generic fleet
 * code asks this; it does not name vendors.
 */
export function providerSupports(
  providerId: string,
  capability: TelematicsCapability
): boolean {
  registerTelematicsProviders();
  return providerRegistry.supports(providerId, capability);
}

/** Whether a provider id is registered. Never throws, never has side effects. */
export function isKnownProvider(providerId: string): boolean {
  registerTelematicsProviders();
  return providerRegistry.has(providerId);
}

/**
 * The provider that produced a stored reading.
 *
 * ---------------------------------------------------------------------
 * THE MIGRATION SEAM
 * ---------------------------------------------------------------------
 * `providerId` is now a first-class field on TelematicsDevice and is set
 * at registration. Rows written before Phase 2 do not have it, so this
 * falls back to the historical device-id prefix convention
 * (`eagletrack-<uin>`, `cartrack-<serial>`, `demo-<vehicleId>`).
 *
 * THE FALLBACK IS DELIBERATELY NOT A GUESS. It recognises only the
 * prefixes this codebase actually wrote, and anything unrecognised
 * returns SOURCE_UNKNOWN — never a default provider. That is the
 * behavioural change: a device posted through the generic ingest
 * endpoint used to be labelled 'cartrack' in every consumer of `source`,
 * and now reports honestly that we do not know.
 *
 * This function is the ONLY place in the codebase permitted to inspect a
 * device-id prefix. It exists so the transitional parsing has exactly
 * one home that can be deleted once
 * `scripts/backfill-device-provider.ts` has run everywhere — rather than
 * the two independent copies (live-map.service.ts and
 * telematics.repository.ts) that existed before.
 */
export function resolveProviderSource(
  device: { providerId?: string; deviceId?: string } | undefined,
  fallbackDeviceId?: string
): string {
  const stored = device?.providerId;
  if (stored && typeof stored === 'string' && stored.trim()) return stored;

  const deviceId = device?.deviceId ?? fallbackDeviceId;
  if (typeof deviceId !== 'string' || !deviceId) return SOURCE_UNKNOWN;

  registerTelematicsProviders();
  for (const id of providerRegistry.listIds()) {
    if (deviceId.startsWith(`${id}-`)) return id;
  }

  if (deviceId.startsWith(`${SOURCE_DEMO}-`)) return SOURCE_DEMO;

  return SOURCE_UNKNOWN;
}

/**
 * The provider's own device identifier, recovered from a stored device.
 *
 * Prefers the first-class `externalDeviceId`; falls back to stripping a
 * recognised provider prefix for rows written before Phase 2. Same
 * single-home rule as above.
 */
export function resolveExternalDeviceId(
  device: { externalDeviceId?: string; providerId?: string; deviceId?: string } | undefined
): string | undefined {
  if (device?.externalDeviceId) return device.externalDeviceId;
  if (!device?.deviceId) return undefined;

  const providerId = resolveProviderSource(device);
  if (providerId === SOURCE_UNKNOWN) return device.deviceId;

  const prefix = `${providerId}-`;
  return device.deviceId.startsWith(prefix)
    ? device.deviceId.slice(prefix.length)
    : device.deviceId;
}

/**
 * The storage key for a device.
 *
 * Retains the `<providerId>-<externalDeviceId>` composition, so existing
 * rows, indexes and the `{tenantId, deviceId}` unique constraint keep
 * working — Phase 2 adds first-class fields WITHOUT a destructive
 * rename. The composition is now a documented storage detail with one
 * producer, rather than an identity scheme that fleet code parses.
 */
export function composeStoredDeviceId(
  providerId: string,
  externalDeviceId: string
): string {
  return `${providerId}-${externalDeviceId}`;
}
