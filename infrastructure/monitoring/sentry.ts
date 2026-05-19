// infrastructure/monitoring/sentry.ts

import * as Sentry from '@sentry/nextjs';

export const initSentry = () => {
  if (process.env.NODE_ENV === 'production' && process.env.SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      tracesSampleRate: 0.1,
      integrations: [
        new Sentry.Integrations.Http({ tracing: true }),
      ],
    });
    console.log('[Sentry] Initialized');
  }
};

export { Sentry };