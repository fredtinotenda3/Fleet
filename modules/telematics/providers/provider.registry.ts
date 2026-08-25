// modules/telematics/providers/provider.registry.ts
//
// PHASE 2 -- providerId -> adapter, and nothing else.
//
// ---------------------------------------------------------------------
// THE RULE THIS EXISTS TO ENFORCE
// ---------------------------------------------------------------------
// An unknown provider id is an ERROR. It is never Cartrack.
//
// That is not a hypothetical. `live-map.service.ts::providerSourceFor`
// ended in `return 'cartrack'`, so every device that was not
// identifiably Eagle Track -- including devices posted through the
// generic ingest endpoint, and including any provider added later --
// was labelled Cartrack. The default was invisible because it was
// plausible.
//
// ---------------------------------------------------------------------
// EXPLICIT REGISTRATION ONLY
// ---------------------------------------------------------------------
// Providers are registered in provider.bootstrap.ts, by name, in code.
// There is deliberately no discovery-by-convention (no directory scan,
// no dynamic import of a path built from a string), because a registry
// that can be populated from data is a registry that can be populated
// from a REQUEST. `resolve(req.query.provider)` must be able to fail;
// it must never be able to load something.
//
// ---------------------------------------------------------------------
// WHY A MUTABLE SINGLETON RATHER THAN A FROZEN MAP
// ---------------------------------------------------------------------
// Tests need to register the mock provider without touching production
// registration -- that is the whole point of the third-provider proof.
// `register()` is therefore public, but:
//
//   * re-registering the same id THROWS rather than silently replacing,
//     so a duplicate registration surfaces at boot rather than as a
//     mystery at runtime; and
//   * `reset()` exists for test isolation and is documented as
//     test-only.
//
// The alternative -- a frozen map plus a separate test seam -- would
// mean the mock provider goes through a different path from a real one,
// which would make the extensibility proof prove less.

import {
  ProviderDescriptor,
  TelematicsCapability,
  TelematicsProviderId,
  supportsCapability,
} from './provider.types';
import { TelematicsProvider } from './provider.contract';
import { ProviderError } from './provider.errors';

class TelematicsProviderRegistry {
  private readonly providers = new Map<TelematicsProviderId, TelematicsProvider>();

  /**
   * Registers a provider.
   *
   * Throws on a duplicate id. Silently replacing would mean two modules
   * both believing they own 'cartrack', with the winner decided by
   * import order -- a class of bug that only appears in production, and
   * only under a specific bundling.
   */
  register(provider: TelematicsProvider): void {
    const id = provider.descriptor.providerId;

    if (!id || typeof id !== 'string' || !id.trim()) {
      throw new Error('[ProviderRegistry] A provider must declare a non-empty providerId.');
    }

    if (this.providers.has(id)) {
      throw new Error(
        `[ProviderRegistry] Provider '${id}' is already registered. ` +
          'Each providerId may be registered exactly once.'
      );
    }

    this.providers.set(id, provider);
  }

  /**
   * Resolves a provider, or throws.
   *
   * THE FAIL-CLOSED PATH. Callers that legitimately need "maybe" use
   * `tryResolve`; everything else should use this, so an unknown id
   * stops the operation instead of quietly becoming a default.
   *
   * The error names the registered ids because the realistic cause is a
   * typo or a missing bootstrap import, and a caller staring at
   * "unknown provider" with no list has to go reading source to find
   * out what is available. No secret is exposed: these are static
   * integration names, not tenant data.
   */
  resolve(providerId: string): TelematicsProvider {
    const provider = this.providers.get(providerId);

    if (!provider) {
      throw new ProviderError(
        'device_not_found',
        `Unknown telematics provider '${providerId}'. ` +
          `Registered providers: ${this.listIds().join(', ') || '(none)'}.`,
        { providerId, operation: 'resolve' }
      );
    }

    return provider;
  }

  /** Resolves a provider, or undefined. For callers that must not throw. */
  tryResolve(providerId: string): TelematicsProvider | undefined {
    return this.providers.get(providerId);
  }

  /** Whether a provider id is registered. Never has side effects. */
  has(providerId: string): boolean {
    return this.providers.has(providerId);
  }

  /** Registered ids, sorted for deterministic output in logs and tests. */
  listIds(): TelematicsProviderId[] {
    return [...this.providers.keys()].sort();
  }

  /** Descriptors for every registered provider. */
  listDescriptors(): ProviderDescriptor[] {
    return this.listIds().map((id) => this.providers.get(id)!.descriptor);
  }

  /**
   * Does this provider support this capability?
   *
   * The whole point of the capability model: a caller asks this instead
   * of writing `if (providerId === 'eagletrack')`. An unregistered
   * provider is `false`, not a throw, because the question "can X do Y"
   * has a sensible answer for an X that does not exist.
   */
  supports(providerId: string, capability: TelematicsCapability): boolean {
    const provider = this.providers.get(providerId);
    return provider ? supportsCapability(provider.descriptor, capability) : false;
  }

  /** Every registered provider that advertises a capability. */
  withCapability(capability: TelematicsCapability): TelematicsProvider[] {
    return this.listIds()
      .map((id) => this.providers.get(id)!)
      .filter((p) => supportsCapability(p.descriptor, capability));
  }

  /**
   * TEST ONLY. Clears every registration.
   *
   * Not called by application code anywhere. Exists so a suite can
   * register the mock provider against a clean registry and assert on
   * exactly what it put there.
   */
  reset(): void {
    this.providers.clear();
  }
}

export const providerRegistry = new TelematicsProviderRegistry();

/** Exported for tests that need an isolated instance rather than the singleton. */
export { TelematicsProviderRegistry };
