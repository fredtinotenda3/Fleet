// infrastructure/queue/worker-base.service.ts

import { QUEUE_DEFINITIONS, QueueName } from './queue-definitions';
import { redisConnection } from './queue.service';
import { deadLetterService } from './dead-letter.service';
import { monitoring } from '@/infrastructure/monitoring/logger';
import { runWithContext } from '@/infrastructure/observability/context';
import { withSpan } from '@/infrastructure/observability/tracer';
import { triggerAlert } from '@/infrastructure/observability/alert-rules';

/**
 * Common lifecycle wrapper around a BullMQ Worker: concurrency comes
 * from the queue's definition, completion/failure are tracked via
 * `monitoring.trackJob`, and a job that exhausts every BullMQ retry
 * attempt is routed to DeadLetterService rather than silently
 * disappearing into BullMQ's failed set. Every concrete worker file in
 * this phase (notification, email, sms, webhook, report, maintenance,
 * billing, telemetry, cleanup, backup) extends this class and only
 * implements `process()`.
 *
 * As of Phase 9, every job is wrapped in a correlation context (pulled
 * from `job.data.correlationId` or generated fresh) and a tracing span,
 * so logs, DB queries, and downstream calls spawned during job execution
 * are automatically linked to the originating request or scheduled job.
 * Metrics already flow through monitoring.trackJob, which Phase 9's
 * logger now forwards to Prometheus.
 *
 * Workers are only started when REDIS_URL is configured (see
 * workers/bootstrap.ts) — this class assumes Redis is available.
 */
export abstract class BaseWorker<TPayload = unknown> {
  protected queueName: QueueName;
  private bullWorker: any | null = null;

  constructor(queueName: QueueName) {
    this.queueName = queueName;
  }

  /** Implemented by each concrete worker. Throwing triggers BullMQ retry/backoff. */
  protected abstract process(
    jobName: string,
    payload: TPayload,
    tenantId: string,
    userId?: string
  ): Promise<void>;

  async start(): Promise<void> {
    const def = QUEUE_DEFINITIONS[this.queueName];
    const { Worker } = await import('bullmq');
    const connection = await (redisConnection as any).duplicate?.().catch(() => null);
    // Fall back to letting BullMQ manage its own connection off REDIS_URL
    // if duplicate() isn't available on the proxy.
    const { default: Redis } = await import('ioredis');
    const conn =
      connection ||
      new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });

    this.bullWorker = new Worker(
      this.queueName,
      async (job: any) => {
        const { type, payload, tenantId, userId, correlationId } = job.data;
        const start = Date.now();

        await runWithContext(
          {
            correlationId: correlationId || `job-${job.id}`,
            tenantId,
            userId,
            route: `queue:${this.queueName}`,
            method: 'JOB',
            startTime: start,
          },
          () =>
            withSpan(
              `queue.${this.queueName}.${type}`,
              async () => {
                try {
                  await this.process(type, payload, tenantId, userId);
                  await monitoring.trackJob(
                    type,
                    Date.now() - start,
                    true
                  );
                } catch (error) {
                  await monitoring.trackJob(
                    type,
                    Date.now() - start,
                    false
                  );
                  throw error;
                }
              },
              {
                'job.id': String(job.id),
                'job.type': type,
                'queue.name': this.queueName,
              }
            )
        );
      },
      { connection: conn, concurrency: def.concurrency }
    );

    this.bullWorker.on('failed', async (job: any, err: Error) => {
      if (!job) return;
      const attemptsMax = job.opts?.attempts ?? def.maxAttempts;
      if (job.attemptsMade >= attemptsMax) {
        await deadLetterService.record({
          queueName: this.queueName,
          jobType: job.data?.type || job.name,
          jobId: String(job.id),
          payload: job.data?.payload,
          failedReason: err?.message || 'Unknown error',
          attemptsMade: job.attemptsMade,
          stacktrace: (err as any)?.stack
            ? [(err as any).stack]
            : undefined,
          tenantId: job.data?.tenantId || 'system',
        });

        void triggerAlert({
          metric: 'queue_dead_letter',
          value: 1,
          threshold: 1,
          severity: 'critical',
          message: `Job "${job.data?.type || job.name}" dead-lettered on queue "${this.queueName}" after ${job.attemptsMade} attempts`,
          labels: {
            queue: this.queueName,
            jobType: job.data?.type || job.name,
          },
        });
      } else {
        monitoring.logWarn(
          `[Worker:${this.queueName}] Attempt ${job.attemptsMade}/${attemptsMax} failed for job ${job.id}`,
          {
            error: err.message,
          }
        );
      }
    });

    this.bullWorker.on('error', (err: Error) => {
      monitoring.logError(
        `[Worker:${this.queueName}] Worker-level error`,
        err
      );
    });

    monitoring.logInfo(
      `[Worker:${this.queueName}] Started (concurrency=${def.concurrency})`
    );
  }

  async stop(): Promise<void> {
    await this.bullWorker?.close();
  }
}