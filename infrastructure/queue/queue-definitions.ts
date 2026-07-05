// infrastructure/queue/queue-definitions.ts

/**
 * Central catalogue of every queue in the platform, plus their default
 * concurrency and priority tier. Kept separate from queue.service.ts so
 * workers, the scheduler, and the admin monitoring API can all import
 * queue metadata without pulling in BullMQ/Redis connection code.
 */

export enum JobPriority {
  CRITICAL = 1, // billing webhooks, security alerts
  HIGH = 5,     // notifications, workflow escalations
  NORMAL = 10,  // reports, analytics refresh
  LOW = 20,     // cleanup, backups, telemetry batching
}

export interface QueueDefinition {
  name: string;
  concurrency: number;
  defaultPriority: JobPriority;
  /** Max attempts before a job is routed to the dead-letter queue. */
  maxAttempts: number;
  backoffMs: number;
}

export const QUEUE_DEFINITIONS: Record<string, QueueDefinition> = {
  'process-reminders': { name: 'process-reminders', concurrency: 5, defaultPriority: JobPriority.NORMAL, maxAttempts: 3, backoffMs: 5_000 },
  'send-notification': { name: 'send-notification', concurrency: 10, defaultPriority: JobPriority.HIGH, maxAttempts: 5, backoffMs: 3_000 },
  'send-email': { name: 'send-email', concurrency: 10, defaultPriority: JobPriority.HIGH, maxAttempts: 5, backoffMs: 5_000 },
  'send-sms': { name: 'send-sms', concurrency: 5, defaultPriority: JobPriority.HIGH, maxAttempts: 5, backoffMs: 5_000 },
  'deliver-webhook': { name: 'deliver-webhook', concurrency: 10, defaultPriority: JobPriority.NORMAL, maxAttempts: 6, backoffMs: 10_000 },
  'generate-report': { name: 'generate-report', concurrency: 3, defaultPriority: JobPriority.NORMAL, maxAttempts: 2, backoffMs: 15_000 },
  'refresh-analytics': { name: 'refresh-analytics', concurrency: 2, defaultPriority: JobPriority.LOW, maxAttempts: 2, backoffMs: 30_000 },
  'check-overdue': { name: 'check-overdue', concurrency: 1, defaultPriority: JobPriority.NORMAL, maxAttempts: 3, backoffMs: 10_000 },
  'billing-jobs': { name: 'billing-jobs', concurrency: 3, defaultPriority: JobPriority.CRITICAL, maxAttempts: 5, backoffMs: 10_000 },
  'telemetry-jobs': { name: 'telemetry-jobs', concurrency: 5, defaultPriority: JobPriority.LOW, maxAttempts: 2, backoffMs: 5_000 },
  'cleanup-jobs': { name: 'cleanup-jobs', concurrency: 1, defaultPriority: JobPriority.LOW, maxAttempts: 2, backoffMs: 30_000 },
  'backup-jobs': { name: 'backup-jobs', concurrency: 1, defaultPriority: JobPriority.LOW, maxAttempts: 3, backoffMs: 60_000 },
  'export-data': { name: 'export-data', concurrency: 2, defaultPriority: JobPriority.NORMAL, maxAttempts: 2, backoffMs: 10_000 },
  'dead-letter': { name: 'dead-letter', concurrency: 1, defaultPriority: JobPriority.LOW, maxAttempts: 1, backoffMs: 0 },
} as const;

export type QueueName = keyof typeof QUEUE_DEFINITIONS;