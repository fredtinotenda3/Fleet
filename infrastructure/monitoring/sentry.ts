// infrastructure/monitoring/sentry.ts

// Sentry is optional — only initialised when SENTRY_DSN is set.
// The rest of the codebase imports `Sentry` from this module so the
// reference always resolves even if the package is not installed.

let SentryModule: typeof import('@sentry/nextjs') | null = null;

export const initSentry = async (): Promise<void> => {
  if (
    process.env.NODE_ENV === 'production' &&
    process.env.SENTRY_DSN
  ) {
    try {
      // Dynamic import so the build does not fail if the package is absent
      SentryModule = await import('@sentry/nextjs');
      SentryModule!.init({
        dsn: process.env.SENTRY_DSN,
        tracesSampleRate: 0.1,
      });
      console.log('[Sentry] Initialized');
    } catch {
      console.warn('[Sentry] Package not installed — skipping initialisation');
    }
  }
};

export const Sentry = new Proxy(
  {} as typeof import('@sentry/nextjs'),
  {
    get(_target, prop) {
      if (SentryModule) {
        return (SentryModule as any)[prop];
      }
      // Return a no-op function so call-sites don't throw
      return () => undefined;
    },
  }
);