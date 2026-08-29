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
import { bootstrapCqrs } from '@/server/cqrs/cqrs.module';
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

  /**
   * FIX (worker process never registers CQRS handlers): scripts/worker.js
   * is a standalone entry point (`import('../workers/bootstrap.ts')`) that
   * runs as its own Node process per docker-compose.yml's `worker` service.
   * It does NOT go through Next.js's request pipeline, so `instrumentation.ts`
   * -- which is what calls bootstrapCqrs() for the web process -- never
   * runs here. The result: commandBus/queryBus in this process have zero
   * handlers registered, so anything dispatched via commandBus.execute()
   * (e.g. MaintenanceWorker's 'check-overdue' job calling
   * maintenanceCommandService.bulkUpdateOverdue(), which executes
   * BulkUpdateOverdueCommand) fails with "[CommandBus] No handler
   * registered for command ...".
   *
   * bootstrapCqrs() also calls bootstrapEvents() and is guarded by
   * `global._cqrsBootstrapped`, so calling it here is idempotent and safe
   * even if this process is later changed to also load instrumentation.ts.
   * Must run before any worker below starts processing jobs.
   */
  await bootstrapCqrs();

  if (!process.env.REDIS_URL) {
    /**
     * PHASE 4 -- silence here is not acceptable in production.
     *
     * This was a logWarn in every environment. In development that is
     * right: a developer running `npm run dev` should not need Redis.
     *
     * In PRODUCTION it means telemetry sync, the outbox processor, the
     * nightly backup, the daily rollup and every retention job are all
     * silently not running, while the application serves traffic and
     * looks healthy. The failures are invisible in exactly the way that
     * matters: no telemetry ingested, no backups taken, and nobody told.
     *
     * Escalated to logError so it reaches whatever the deployment
     * monitors. Deliberately NOT a throw: the same bootstrap module is
     * imported by the web process, and killing the web tier because a
     * worker dependency is missing would convert a degraded background
     * tier into a total outage.
     */
    const message = '[Workers] REDIS_URL not configured — background workers disabled';

    if (process.env.NODE_ENV === 'production') {
      monitoring.logError(message, new Error('WORKERS_DISABLED_NO_REDIS'), {
        impact:
          'telemetry sync, outbox processing, backups, rollups and retention jobs are NOT running',
      });
    } else {
      monitoring.logWarn(message);
    }
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
   * Ordered AFTER the bootstrapCqrs() call above would be wrong -- the
   * processor must dispatch into a bus that already has handlers
   * registered, or it would claim rows, deliver them to nobody, and mark
   * them processed. bootstrapCqrs() (which also calls bootstrapEvents())
   * now runs explicitly at the top of this function, so handlers are in
   * place by the time we get here; startOutboxProcessor() additionally
   * no-ops unless outbox mode is configured.
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

  /**
   * FIX (worker process exits immediately): bootstrapWorkers() previously
   * returned as soon as every worker's start() resolved and the SIGTERM/
   * SIGINT handlers were registered. That's correct when this module is
   * imported from a long-lived host (e.g. scripts/worker.js's `main()`
   * keeps the event loop alive via its own pending work), but when this
   * file is run directly -- `node --import tsx workers/bootstrap.ts` with
   * WORKER_RUNTIME=true -- there is nothing else keeping the Node process
   * alive once this async function's promise settles, so it exits right
   * after logging "worker(s) started" with no jobs ever processed. This
   * promise deliberately never resolves; the process now stays alive
   * until the SIGTERM/SIGINT handlers above call process.exit().
   */
  await new Promise<void>(() => {});
}

if (process.env.WORKER_RUNTIME === 'true') {
  bootstrapWorkers().catch((error) => {
    monitoring.logError('[Workers] Fatal bootstrap error', error);
    process.exit(1);
  });
}