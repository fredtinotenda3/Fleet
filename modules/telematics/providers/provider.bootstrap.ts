// modules/telematics/providers/provider.bootstrap.ts
//
// PHASE 2 -- the one place providers are registered.
//
// ---------------------------------------------------------------------
// EXPLICIT, BY NAME, IN CODE
// ---------------------------------------------------------------------
// No directory scan, no dynamic import of a path built from a string, no
// registration driven by configuration data. A registry that can be
// populated from data can be populated from a REQUEST, and
// `resolve(req.query.provider)` must be able to FAIL rather than able to
// LOAD.
//
// Adding a provider is therefore a code change here plus an adapter --
// and, per the Phase 2 acceptance criteria, nothing else. If a future
// provider requires an edit to fleet intelligence, vehicle domain,
// attention, reporting or analytics, that is a bug in the abstraction,
// not a step in the process. tests/security/telematics-provider-
// extensibility.spec.ts asserts this.
//
// ---------------------------------------------------------------------
// WHY NOT AUTOMATIC, AND WHY IDEMPOTENT
// ---------------------------------------------------------------------
// `registerTelematicsProviders()` is called lazily by
// `getTelematicsProvider()` (provider.resolve.ts) rather than at module
// load. Next.js bundles the same module into several runtimes (server
// components, route handlers, workers); a top-level side effect would
// run an unpredictable number of times, and `registry.register()`
// deliberately THROWS on a duplicate id so a second run would crash the
// process rather than no-op.
//
// The guard below makes the function safe to call from anywhere, while
// keeping `register()` strict -- so a genuine double-registration of two
// DIFFERENT adapters claiming the same id still fails loudly, which is
// the case worth catching.
//
// The demo simulator is NOT registered. It has no credentials and no
// external API; it is a UI fixture, not a data source. The mock provider
// is not registered either -- see mock/mock.provider.ts.

import { providerRegistry } from './provider.registry';
import { cartrackProvider } from '../adapters/cartrack/cartrack.provider';
import { eagletrackProvider } from '../adapters/eagletrack/eagletrack.provider';

let registered = false;

/** Registers the providers this deployment ships with. Idempotent. */
export function registerTelematicsProviders(): void {
  if (registered) return;
  registered = true;

  providerRegistry.register(cartrackProvider);
  providerRegistry.register(eagletrackProvider);
}

/**
 * TEST ONLY. Clears the registry and the guard together.
 *
 * The two must be reset as a pair: clearing the registry alone would
 * leave `registered = true`, so the next call would silently skip
 * registration and every resolve would fail with "unknown provider" --
 * a confusing failure in an unrelated test.
 */
export function resetTelematicsProviders(): void {
  providerRegistry.reset();
  registered = false;
}
