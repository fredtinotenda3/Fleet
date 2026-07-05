import winston from 'winston';
import { getContext } from './context';

const { combine, timestamp, json, errors } = winston.format;

const baseLogger = winston.createLogger({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  format: combine(errors({ stack: true }), timestamp(), json()),
  defaultMeta: {
    service: process.env.OTEL_SERVICE_NAME || 'fleet-platform',
    environment: process.env.NODE_ENV || 'development',
  },
  transports: [new winston.transports.Console()],
});

function enrich(meta?: Record<string, unknown>): Record<string, unknown> {
  const ctx = getContext();
  return {
    ...meta,
    ...(ctx?.correlationId && { correlationId: ctx.correlationId }),
    ...(ctx?.traceId && { traceId: ctx.traceId }),
    ...(ctx?.tenantId && { tenantId: ctx.tenantId }),
    ...(ctx?.userId && { userId: ctx.userId }),
    ...(ctx?.route && { route: ctx.route }),
  };
}

/** JSON structured logger. Every line auto-carries correlation/trace/tenant/user IDs from AsyncLocalStorage. */
export const structuredLogger = {
  info(message: string, meta?: Record<string, unknown>) {
    baseLogger.info(message, enrich(meta));
  },
  warn(message: string, meta?: Record<string, unknown>) {
    baseLogger.warn(message, enrich(meta));
  },
  error(message: string, error?: Error, meta?: Record<string, unknown>) {
    baseLogger.error(message, enrich({ ...meta, errorMessage: error?.message, stack: error?.stack }));
  },
  debug(message: string, meta?: Record<string, unknown>) {
    baseLogger.debug(message, enrich(meta));
  },
};