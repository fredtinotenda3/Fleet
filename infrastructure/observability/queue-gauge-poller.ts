import { QUEUE_DEFINITIONS } from '@/infrastructure/queue/queue-definitions';
import { queueService } from '@/infrastructure/queue/queue.service';
import { metricsRegistry } from './metrics.registry';
import { structuredLogger } from './structured-logger';
import { triggerAlert, ALERT_THRESHOLDS } from './alert-rules';

let interval: NodeJS.Timeout | null = null;

export function startQueueGaugePoller(intervalMs: number = 15_000): void {
  if (interval || !process.env.REDIS_URL) return;

  interval = setInterval(async () => {
    for (const queueName of Object.keys(QUEUE_DEFINITIONS)) {
      try {
        const counts = await queueService.getQueueCounts(queueName);
        for (const [state, value] of Object.entries(counts)) {
          metricsRegistry.queueDepthGauge.set({ queue: queueName, state }, Number(value) || 0);
        }

        const backlog = (counts.waiting || 0) + (counts.active || 0) + (counts.delayed || 0);
        if (backlog >= ALERT_THRESHOLDS.queueBacklog) {
          void triggerAlert({
            metric: 'queue_backlog',
            value: backlog,
            threshold: ALERT_THRESHOLDS.queueBacklog,
            severity: 'warning',
            message: `Queue "${queueName}" backlog is ${backlog} jobs`,
            labels: { queue: queueName },
          });
        }
      } catch (error) {
        structuredLogger.warn(`[QueueGaugePoller] Failed to poll queue "${queueName}"`, {
          error: (error as Error).message,
        });
      }
    }
  }, intervalMs);

  interval.unref?.();
  structuredLogger.info('[Observability] Queue gauge poller started');
}

export function stopQueueGaugePoller(): void {
  if (interval) clearInterval(interval);
  interval = null;
}