// infrastructure/monitoring/logger.ts

import { structuredLogger } from '@/infrastructure/observability/structured-logger';
import { metricsRegistry } from '@/infrastructure/observability/metrics.registry';

export class MonitoringService {
  logInfo(message: string, meta?: Record<string, unknown>): void {
    structuredLogger.info(message, meta);
  }

  logError(
    message: string,
    error?: Error,
    meta?: Record<string, unknown>
  ): void {
    structuredLogger.error(message, error, meta);
  }

  logWarn(message: string, meta?: Record<string, unknown>): void {
    structuredLogger.warn(message, meta);
  }

  logDebug(message: string, meta?: Record<string, unknown>): void {
    structuredLogger.debug(message, meta);
  }

  async trackMetric(
    name: string,
    value: number,
    tags?: Record<string, string>
  ): Promise<void> {
    metricsRegistry.observeGeneric(name, value, tags);
    structuredLogger.debug(`Metric: ${name}=${value}`, {
      metric: name,
      value,
      tags,
    });
  }

  async trackApiLatency(
    endpoint: string,
    durationMs: number,
    statusCode: number
  ): Promise<void> {
    metricsRegistry.httpRequestDuration.observe(
      { route: endpoint, status: String(statusCode) } as never,
      durationMs / 1000
    );
    await this.trackMetric('api.latency', durationMs, {
      endpoint,
      status: statusCode.toString(),
    });
  }

  async trackDatabaseQuery(
    collection: string,
    durationMs: number
  ): Promise<void> {
    metricsRegistry.dbQueryDuration.observe(
      { collection, operation: 'unknown' },
      durationMs / 1000
    );
    await this.trackMetric('db.query.duration', durationMs, { collection });
  }

  async trackJob(
    jobType: string,
    durationMs: number,
    success: boolean
  ): Promise<void> {
    metricsRegistry.queueJobDuration.observe(
      { jobType, status: success ? 'success' : 'failure' },
      durationMs / 1000
    );
    metricsRegistry.queueJobTotal.inc({
      jobType,
      status: success ? 'success' : 'failure',
    });
    await this.trackMetric('job.duration', durationMs, {
      type: jobType,
      success: success.toString(),
    });
  }
}

export const monitoring = new MonitoringService();