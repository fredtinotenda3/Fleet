// infrastructure/monitoring/sentry.ts
//
// Sentry has been REMOVED as a dependency. This module remains as a
// dependency-free no-op so any future `import { Sentry }` still
// resolves, and so the decision is recorded where someone would look
// for it rather than only in a changelog.
//
// ---------------------------------------------------------------------
// Why it was removed rather than upgraded
// ---------------------------------------------------------------------
//   1. `@sentry/nextjs@^6.3.5` predates the App Router entirely and is
//      incompatible with Next 15. It has never initialised in this
//      deployment.
//   2. NOTHING imported it. A grep for `monitoring/sentry` across the
//      repository matched only this file. The package was pure weight.
//   3. Its postinstall downloads a binary from downloads.sentry-cdn.com.
//      That 403s behind a proxy or in an air-gapped CI, which made
//      `npm install` fail outright for a package that was doing nothing.
//      That failure cost real debugging time more than once.
//
// Upgrading was the alternative, but re-adding an SDK nothing calls just
// to make the version number current is not observability -- it is a
// dependency with a build-time network call. When error reporting is
// actually wanted, install a current `@sentry/nextjs` and implement the
// two functions below for real. The call sites will not need to change.

/** No-op. Kept so callers do not need a conditional import. */
export const initSentry = async (): Promise<void> => {
  // Intentionally empty. See the note above.
};

/**
 * No-op stand-in for the Sentry SDK surface.
 *
 * Any method call resolves to a function that does nothing, so
 * `Sentry.captureException(e)` is safe to write today and becomes real
 * the moment the SDK is reinstated. Errors still reach the structured
 * logger and the audit log -- this module was never the only path.
 */
export const Sentry = new Proxy({} as Record<string, unknown>, {
  get() {
    return () => undefined;
  },
}) as unknown as SentryStub;

/**
 * The subset of the SDK surface call sites are likely to reach for.
 * The index signature is intentionally last and widest so an unlisted
 * method still type-checks against the Proxy.
 */
interface SentryStub {
  captureException(error: unknown): void;
  captureMessage(message: string): void;
  setUser(user: unknown): void;
  [key: string]: (...args: never[]) => unknown;
}
