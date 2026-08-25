// workers/bootstrap.ts

import { NotificationWorker } from './notification.worker';
import { EmailWorker } from './email.worker';
import { SmsWorker } from './sms.worker';
import { webhookWorker } from './webhook.worker';
import { ReportWorker } from './report.worker';
import { reportExecutionWorker } from './report-execution.worker';
import { MaintenanceWorker } from './maintenance.worker';
import { BillingWorker } from './billing.worker';
import { TelemetryWorker } from './telemetry.worker';
import { CleanupWorker } from './cleanup.worker';
import { BackupWorker } from './backup.worker';
import { analyticsRefreshWorker } from './analytics-refresh.worker';
import { slaComplianceWorker } from '@/infrastructure/queue/workers/sla-compliance.worker';
import { bootstrapDefaultSchedules } from '@/server/scheduler/bootstrap-schedules';
import { bootstrapReporting } from '@/modules/reporting/registry/bootstrap-reporting';
import { monitoring } from '@/infrastructure/monitoring/logger';
import { initObservability } from '@/infrastructure/observability/otel';
import { startQueueGaugePoller } from '@/infrastructure/observability/queue-gauge-poller';
import { startOutboxProcessor } from '@/server/events/outbox/outbox-runner';

declare global {
  // eslint-disable-next-line no-var
  var _workersBootstrapped: boolean | undefined;
}

/**
 * Single entry point that starts every BullMQ worker plus the scheduler
 * reconciliation pass. Intended to run in a dedicated worker process
 * (see scripts/worker.js referenced by docker-compose.yml's `worker`
 * service) rather than inside the Next.js request-serving process,
 * since long-lived BullMQ Worker connections don't fit a serverless
 * request/response lifecycle. No-ops entirely when REDIS_URL is unset,
 * consistent with every other Redis-optional subsystem in this codebase.
 *
 * As of Phase 9, initializes OpenTelemetry (traces, metrics, logs export)
 * and starts the queue-gauge poller before any workers begin processing,
 * so every job handled by a worker automatically gets correlation context,
 * tracing spans, and Prometheus-backed queue-depth gauges with zero
 * per-worker changes required.
 */
export async function bootstrapWorkers(): Promise<void> {
  if (global._workersBootstrapped) return;

  if (!process.env.REDIS_URL) {
    monitoring.logWarn(
      '[Workers] REDIS_URL not configured â€” background workers disabled'
    );
    return;
  }

  // Phase 9 â€” Enterprise Observability: initialize OpenTelemetry SDK
  // and start periodic queue-depth gauge collection before workers start
  await initObservability();
  startQueueGaugePoller();

  /**
   * PHASE 3 -- outbox processor.
   *
   * Started HERE, in the dedicated worker process, because this is the
   * one place in the platform guaranteed to be long-lived: the function
   * has already returned above if REDIS_URL is unset, which is exactly
   * the serverless case where a poll loop cannot be relied on.
   *
   * Ordered AFTER bootstrapEvents() below would be wrong -- the
   * processor must dispatch into a bus that already has handlers
   * registered, or it would claim rows, deliver them to nobody, and mark
   * them processed. bootstrapEvents() runs at module load via
   * instrumentation.ts before this function is reached, so handlers are
   * in place; startOutboxProcessor() additionally no-ops unless outbox
   * mode is configured.
   */
  startOutboxProcessor();

  global._workersBootstrapped = true;

  const workers = [
    new NotificationWorker(),
    new EmailWorker(),
    new SmsWorker(),
    webhookWorker,
    new ReportWorker(),
    reportExecutionWorker,
    new MaintenanceWorker('check-overdue'),
    new MaintenanceWorker('process-reminders'),
    new BillingWorker('billing-jobs'),
    new TelemetryWorker('telemetry-jobs'),
    new CleanupWorker('cleanup-jobs'),
    new BackupWorker(),
    /**
     * FIX (Phase D finalization): bootstrap-schedules.ts registers the
     * 'analytics-refresh' (every 6h), 'sla-process-due' (every 5min),
     * and 'compliance-recalculate-statuses' (daily) cron schedules,
     * which enqueue onto the 'refresh-analytics' and 'cleanup-jobs'
     * BullMQ queues respectively -- but neither worker below was ever
     * added to this array, so those jobs accumulated unprocessed
     * indefinitely despite both files already containing the correct
     * Phase D BackgroundJobScopeService-based fix. Both are exported as
     * singletons (matching webhookWorker/reportExecutionWorker above),
     * not classes, so they are referenced directly rather than
     * constructed here.
     */
    analyticsRefreshWorker,
    slaComplianceWorker,
  ];

  for (const worker of workers) {
    await worker.start();
  }

  await bootstrapDefaultSchedules();
  await bootstrapReporting();

  monitoring.logInfo(
    `[Workers] ${workers.length} worker(s) started; schedules reconciled.`
  );

  const shutdown = async () => {
    monitoring.logInfo('[Workers] Shutting down...');
    await Promise.all(workers.map((w) => w.stop()));
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}