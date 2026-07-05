// server/scheduler/bootstrap-schedules.ts

import { cronEngineService } from './cron-engine.service';
import { scheduledJobRepository } from './scheduled-job.repository';
import { JobType } from '@/infrastructure/queue/queue.service';
import { monitoring } from '@/infrastructure/monitoring/logger';

/**
 * Ensures the platform's baseline recurring jobs exist as ScheduledJob
 * records (idempotent — skips any name that already exists), then asks
 * CronEngineService to reconcile every active record against BullMQ's
 * repeatable-job set. This replaces the old pattern of individual Vercel
 * Cron routes each calling one service method directly (see
 * app/api/reminders/notify-overdue, /update-status,
 * /api/workflows/process-timeouts, /api/security/expire-grants) — those
 * routes still work as manual/external triggers, but the recurring
 * schedule itself now lives in one place and is visible/editable via
 * the admin Job Scheduler API instead of being implicit in Vercel's
 * cron config.
 */
const DEFAULT_SCHEDULES: Array<{ name: string; description: string; jobType: JobType; cron: string }> = [
  { name: 'reminders-overdue-check', description: 'Mark overdue reminders and notify assignees', jobType: JobType.CHECK_OVERDUE, cron: '0 * * * *' },
  { name: 'analytics-refresh', description: 'Refresh cached fleet analytics', jobType: JobType.REFRESH_ANALYTICS, cron: '0 */6 * * *' },
  { name: 'billing-expire-invoices', description: 'Expire stale pending invoices', jobType: JobType.EXPIRE_INVOICES, cron: '0 * * * *' },
  { name: 'security-expire-grants', description: 'Soft-delete expired ResourcePermission grants', jobType: JobType.EXPIRE_RESOURCE_GRANTS, cron: '*/15 * * * *' },
  { name: 'telemetry-offline-devices', description: 'Detect and alert on offline telematics devices', jobType: JobType.DETECT_OFFLINE_DEVICES, cron: '*/10 * * * *' },
  { name: 'cleanup-sessions', description: 'Expire stale sessions, refresh tokens, and API keys', jobType: JobType.CLEANUP_SESSIONS, cron: '0 3 * * *' },
  { name: 'cleanup-notifications', description: 'Purge old/expired notifications', jobType: JobType.CLEANUP_NOTIFICATIONS, cron: '0 4 * * *' },
  { name: 'cleanup-outbox', description: 'Purge processed outbox events', jobType: JobType.CLEANUP_OUTBOX, cron: '0 5 * * *' },
  { name: 'nightly-backup', description: 'Run the nightly database backup', jobType: JobType.RUN_BACKUP, cron: '0 2 * * *' },
  // ── FleetOps – SLA & Compliance ───────────────────────────────────
  { name: 'sla-process-due', description: 'Warn/breach SLA trackings past threshold', jobType: JobType.PROCESS_SLA_TRACKINGS, cron: '*/5 * * * *' },
  { name: 'compliance-recalculate-statuses', description: 'Recompute due_soon/overdue compliance records', jobType: JobType.PROCESS_COMPLIANCE_STATUSES, cron: '0 6 * * *' },
];

export async function bootstrapDefaultSchedules(): Promise<void> {
  for (const def of DEFAULT_SCHEDULES) {
    const existing = await scheduledJobRepository.findByName(def.name);
    if (existing) continue;
    try {
      await cronEngineService.create(
        { name: def.name, description: def.description, jobType: def.jobType, cron: def.cron, payload: {} },
        'system'
      );
    } catch (error) {
      monitoring.logError(`[bootstrap-schedules] Failed to create default schedule "${def.name}"`, error as Error);
    }
  }

  await cronEngineService.reconcile();
}