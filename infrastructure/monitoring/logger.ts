// infrastructure/monitoring/logger.ts

import winston from 'winston';
import { Sentry } from './sentry';

const { combine, timestamp, printf, colorize, json } = winston.format;

const customFormat = printf(({ level, message, timestamp, ...meta }) => {
  return `${timestamp} [${level}]: ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
});

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    timestamp(),
    process.env.NODE_ENV === 'production' ? json() : customFormat
  ),
  transports: [
    new winston.transports.Console({
      format: combine(
        colorize(),
        customFormat
      ),
    }),
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
  ],
});

export class MonitoringService {
  logInfo(message: string, meta?: Record<string, any>) {
    logger.info(message, meta);
  }

  logError(message: string, error?: Error, meta?: Record<string, any>) {
    logger.error(message, { error: error?.message, stack: error?.stack, ...meta });
    
    if (process.env.NODE_ENV === 'production') {
      Sentry.captureException(error, {
        extra: meta,
        tags: { service: 'fleet-api' },
      });
    }
  }

  logWarn(message: string, meta?: Record<string, any>) {
    logger.warn(message, meta);
  }

  logDebug(message: string, meta?: Record<string, any>) {
    logger.debug(message, meta);
  }

  async trackMetric(name: string, value: number, tags?: Record<string, string>) {
    logger.info(`Metric: ${name}=${value}`, { metric: name, value, tags });
    // Could also send to DataDog, Prometheus, etc.
  }

  async trackApiLatency(endpoint: string, durationMs: number, statusCode: number) {
    await this.trackMetric('api.latency', durationMs, {
      endpoint,
      status: statusCode.toString(),
    });
  }

  async trackDatabaseQuery(collection: string, durationMs: number) {
    await this.trackMetric('db.query.duration', durationMs, { collection });
  }

  async trackJob(jobType: string, durationMs: number, success: boolean) {
    await this.trackMetric('job.duration', durationMs, {
      type: jobType,
      success: success.toString(),
    });
  }
}

export const monitoring = new MonitoringService();