import { cacheService } from '@/infrastructure/cache/cache.service';
import { EventBusFactory } from '@/server/events/bus/EventBusFactory';
import { DomainEvent } from '@/server/events/base/DomainEvent';
import { OBSERVABILITY_ALERT_TRIGGERED } from './event-names';
import { structuredLogger } from './structured-logger';

export type AlertSeverity = 'warning' | 'critical';

export interface AlertContext {
  metric: string;
  value: number;
  threshold: number;
  severity: AlertSeverity;
  message: string;
  labels?: Record<string, string>;
}

const COOLDOWN_SECONDS = Number(process.env.ALERT_COOLDOWN_SECONDS || 300);

/**
 * Fires an observability alert at most once per COOLDOWN_SECONDS per
 * unique metric+label combination, so an ongoing incident doesn't page
 * on-call once per request/job/query.
 */
export async function triggerAlert(ctx: AlertContext): Promise<void> {
  const cooldownKey = `alert-cooldown:${ctx.metric}:${JSON.stringify(ctx.labels || {})}`;

  const alreadyFired = await cacheService.exists(cooldownKey).catch(() => false);
  if (alreadyFired) return;

  await cacheService.set(cooldownKey, '1', { ttl: COOLDOWN_SECONDS }).catch(() => undefined);

  structuredLogger.warn(`[Alert] ${ctx.message}`, {
    metric: ctx.metric,
    value: ctx.value,
    threshold: ctx.threshold,
    severity: ctx.severity,
    labels: ctx.labels,
  });

  const bus = EventBusFactory.getInstance();
  await bus
    .publish(
      new (class extends DomainEvent {
        constructor() {
          super(
            OBSERVABILITY_ALERT_TRIGGERED,
            {
              entityType: 'alert',
              metric: ctx.metric,
              value: ctx.value,
              threshold: ctx.threshold,
              severity: ctx.severity,
              message: ctx.message,
              labels: ctx.labels,
            },
            { tenantId: 'system' }
          );
        }
      })()
    )
    .catch(() => undefined);
}

/** Threshold table, tunable via env without a redeploy. */
export const ALERT_THRESHOLDS = {
  errorRatePercent: Number(process.env.ALERT_ERROR_RATE_PERCENT || 5),
  p95LatencyMs: Number(process.env.ALERT_P95_LATENCY_MS || 2000),
  queueBacklog: Number(process.env.ALERT_QUEUE_BACKLOG || 500),
  deadLetterCount: Number(process.env.ALERT_DEAD_LETTER_COUNT || 10),
};