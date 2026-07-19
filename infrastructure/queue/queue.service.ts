// infrastructure/queue/queue.service.ts
// BullMQ queue service. Redis connection is created lazily so the
// application boots correctly in environments where REDIS_URL is absent.
//
// Phase 8 additions: full JobType roster for every worker category,
// priority support (via JobPriority), dead-letter routing metadata, and
// helpers used by the scheduler / admin monitoring API.

import { QUEUE_DEFINITIONS, JobPriority, QueueName } from './queue-definitions';
import { generateCorrelationId, getCorrelationId } from '@/infrastructure/observability/context';

export enum JobType {
  // Reminders / maintenance
  PROCESS_REMINDERS = 'process-reminders',
  PROCESS_SINGLE_REMINDER = 'process-single-reminder',
  CHECK_OVERDUE = 'check-overdue',

  // Notifications
  SEND_NOTIFICATION = 'send-notification',
  SEND_EMAIL = 'send-email',
  SEND_SMS = 'send-sms',

  // Integrations
  DELIVER_WEBHOOK = 'deliver-webhook',

  // Reporting / analytics
  GENERATE_REPORT = 'generate-report',
  REFRESH_ANALYTICS = 'refresh-analytics',
  EXPORT_DATA = 'export-data',

  // Billing
  EXPIRE_INVOICES = 'expire-invoices',
  POLL_PENDING_PAYMENTS = 'poll-pending-payments',

  // Telemetry
  INGEST_TELEMETRY_BATCH = 'ingest-telemetry-batch',
  DETECT_OFFLINE_DEVICES = 'detect-offline-devices',

  // Cleanup
  CLEANUP_LOGS = 'cleanup-logs',
  CLEANUP_SESSIONS = 'cleanup-sessions',
  CLEANUP_NOTIFICATIONS = 'cleanup-notifications',
  CLEANUP_OUTBOX = 'cleanup-outbox',
  EXPIRE_RESOURCE_GRANTS = 'expire-resource-grants',

  // Backups
  RUN_BACKUP = 'run-backup',

  // ── FleetOps – SLA & Compliance ───────────────────────────────────
  PROCESS_SLA_TRACKINGS = 'process-sla-trackings',
  PROCESS_COMPLIANCE_STATUSES = 'process-compliance-statuses',
}

export interface JobData {
  type: JobType;
  payload: unknown;
  tenantId: string;
  userId?: string;
  scheduledFor?: Date;
  priority?: JobPriority;
  correlationId?: string; // NEW — propagated to the worker's execution context
}

// ──────────────────── PATCH START: Redis connection with timeouts ────────────────────
const REDIS_CONNECT_TIMEOUT_MS = 1500;
const REDIS_MAX_CONNECTION_RETRIES = 2;

let _redisPromise: Promise<any> | null = null;
let _redisDisabled = false;

async function getRedis(): Promise<any> {
  if (!process.env.REDIS_URL) {
    throw new Error(
      'REDIS_URL is not configured. Queue operations are unavailable.'
    );
  }
  if (_redisDisabled) {
    throw new Error('Redis is currently unreachable. Queue operations are unavailable.');
  }
  if (_redisPromise) return _redisPromise;

  _redisPromise = (async () => {
    const { default: Redis } = await import('ioredis');
    const client = new Redis(process.env.REDIS_URL!, {
      // BullMQ requirement -- do not change.
      maxRetriesPerRequest: null,
      connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
      retryStrategy: (times: number) => {
        if (times > REDIS_MAX_CONNECTION_RETRIES) {
          _redisDisabled = true;
          return null; // stop retrying -- connection is considered dead
        }
        return Math.min(times * 200, 1000);
      },
    });

    client.on('error', (err: Error) => {
      console.warn('[QueueService] Redis connection error:', err.message);
    });

    return client;
  })();

  return _redisPromise;
}

// Exported so health check can call ping() without triggering full init
export const redisConnection = new Proxy(
  {} as any,
  {
    get(_target, prop) {
      if (prop === 'then') return undefined; // avoid being treated as thenable
      return async (...args: any[]) => {
        const redis = await getRedis();
        return redis[prop as string](...args);
      };
    },
  }
);
// ──────────────────── PATCH END ──────────────────────────────────────────────────────

/**
 * Maps a JobType to the underlying queue it runs on. Several JobTypes
 * intentionally share a queue (e.g. all billing-related jobs run on
 * 'billing-jobs') so the concurrency/priority tier in
 * queue-definitions.ts applies uniformly to the whole category.
 */
const JOB_TYPE_QUEUE_MAP: Record<JobType, QueueName> = {
  [JobType.PROCESS_REMINDERS]: 'process-reminders',
  [JobType.PROCESS_SINGLE_REMINDER]: 'process-reminders',
  [JobType.CHECK_OVERDUE]: 'check-overdue',
  [JobType.SEND_NOTIFICATION]: 'send-notification',
  [JobType.SEND_EMAIL]: 'send-email',
  [JobType.SEND_SMS]: 'send-sms',
  [JobType.DELIVER_WEBHOOK]: 'deliver-webhook',
  [JobType.GENERATE_REPORT]: 'generate-report',
  [JobType.REFRESH_ANALYTICS]: 'refresh-analytics',
  [JobType.EXPORT_DATA]: 'export-data',
  [JobType.EXPIRE_INVOICES]: 'billing-jobs',
  [JobType.POLL_PENDING_PAYMENTS]: 'billing-jobs',
  [JobType.INGEST_TELEMETRY_BATCH]: 'telemetry-jobs',
  [JobType.DETECT_OFFLINE_DEVICES]: 'telemetry-jobs',
  [JobType.CLEANUP_LOGS]: 'cleanup-jobs',
  [JobType.CLEANUP_SESSIONS]: 'cleanup-jobs',
  [JobType.CLEANUP_NOTIFICATIONS]: 'cleanup-jobs',
  [JobType.CLEANUP_OUTBOX]: 'cleanup-jobs',
  [JobType.EXPIRE_RESOURCE_GRANTS]: 'cleanup-jobs',
  [JobType.RUN_BACKUP]: 'backup-jobs',
  // ── FleetOps – SLA & Compliance (route to cleanup-jobs queue) ─────
  [JobType.PROCESS_SLA_TRACKINGS]: 'cleanup-jobs',
  [JobType.PROCESS_COMPLIANCE_STATUSES]: 'cleanup-jobs',
};

export function queueNameForJobType(type: JobType): QueueName {
  return JOB_TYPE_QUEUE_MAP[type];
}

let _queues: Map<string, Promise<any>> | null = null;

export async function getQueue(queueName: string): Promise<any> {
  if (!_queues) {
    _queues = new Map();
  }
  if (!_queues.has(queueName)) {
    const queuePromise = (async () => {
      const { Queue } = await import('bullmq');
      const redis = await getRedis();
      return new Queue(queueName, { connection: redis });
    })();
    _queues.set(queueName, queuePromise);
  }
  return _queues.get(queueName)!;
}

export class QueueService {
  async addJob(
    jobType: JobType,
    data: JobData,
    options?: {
      delay?: number;
      repeat?: { cron: string };
      priority?: JobPriority;
      jobId?: string;
      attempts?: number;
    }
  ): Promise<any> {
    const queueName = queueNameForJobType(jobType);
    const def = QUEUE_DEFINITIONS[queueName];

    try {
      const queue = await getQueue(queueName);
      const correlationId = data.correlationId || getCorrelationId() || generateCorrelationId();
      const job = await queue.add(jobType, { ...data, correlationId }, {
        delay: options?.delay,
        repeat: options?.repeat,
        priority: options?.priority ?? data.priority ?? def.defaultPriority,
        jobId: options?.jobId,
        attempts: options?.attempts ?? def.maxAttempts,
        backoff: { type: 'exponential', delay: def.backoffMs || 5_000 },
        removeOnComplete: { age: 24 * 3600, count: 1000 },
        removeOnFail: false, // dead-letter worker inspects failed jobs before cleanup
      });
      console.log(`[Queue] Job added: ${jobType} on "${queueName}" (${job.id})`);
      return job;
    } catch (error) {
      console.warn(`[Queue] Could not add job ${jobType}:`, error);
      return null;
    }
  }

  async addReminderJob(reminder: any, tenantId: string): Promise<any> {
    return this.addJob(
      JobType.PROCESS_SINGLE_REMINDER,
      { type: JobType.PROCESS_SINGLE_REMINDER, payload: reminder, tenantId },
      { delay: Math.max(0, new Date(reminder.due_date).getTime() - Date.now()) }
    );
  }

  async addNotificationJob(userId: string, notification: unknown, tenantId: string): Promise<any> {
    return this.addJob(JobType.SEND_NOTIFICATION, {
      type: JobType.SEND_NOTIFICATION,
      payload: { userId, notification },
      tenantId,
    });
  }

  async addReportJob(reportConfig: unknown, tenantId: string, userId: string): Promise<any> {
    return this.addJob(JobType.GENERATE_REPORT, {
      type: JobType.GENERATE_REPORT,
      payload: reportConfig,
      tenantId,
      userId,
    });
  }

  async addWebhookJob(delivery: { url: string; secret?: string; event: string; payload: unknown }, tenantId: string): Promise<any> {
    return this.addJob(JobType.DELIVER_WEBHOOK, {
      type: JobType.DELIVER_WEBHOOK,
      payload: delivery,
      tenantId,
      priority: JobPriority.NORMAL,
    });
  }

  async scheduleAnalyticsRefresh(tenantId: string): Promise<any> {
    return this.addJob(
      JobType.REFRESH_ANALYTICS,
      { type: JobType.REFRESH_ANALYTICS, payload: {}, tenantId },
      { repeat: { cron: '0 */6 * * *' } }
    );
  }

  async scheduleOverdueCheck(): Promise<any> {
    return this.addJob(
      JobType.CHECK_OVERDUE,
      { type: JobType.CHECK_OVERDUE, payload: {}, tenantId: 'system' },
      { repeat: { cron: '0 8 * * *' } }
    );
  }

  /** Used by the admin monitoring API and CronEngineService. */
  async getQueueCounts(queueName: string) {
    const queue = await getQueue(queueName);
    return queue.getJobCounts('waiting', 'active', 'delayed', 'completed', 'failed', 'paused');
  }

  async getRepeatableJobs(queueName: string) {
    const queue = await getQueue(queueName);
    return queue.getRepeatableJobs();
  }

  async removeRepeatable(queueName: string, jobName: string, repeat: { cron: string }, jobId?: string) {
    const queue = await getQueue(queueName);
    return queue.removeRepeatable(jobName, { ...repeat, jobId } as any);
  }

  async retryJob(queueName: string, jobId: string) {
    const queue = await getQueue(queueName);
    const job = await queue.getJob(jobId);
    if (!job) return false;
    await job.retry();
    return true;
  }

  async getFailedJobs(queueName: string, limit: number = 50) {
    const queue = await getQueue(queueName);
    return queue.getFailed(0, limit);
  }
}

export const queueService = new QueueService();