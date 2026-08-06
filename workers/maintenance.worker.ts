// workers/maintenance.worker.ts

import { ObjectId } from 'mongodb';
import { BaseWorker } from '@/infrastructure/queue/worker-base.service';
import { maintenanceCommandService } from '@/modules/maintenance/services/maintenance-command.service';
import { notificationService } from '@/modules/notifications/services/notification.service';
import { backgroundJobScopeService } from '@/server/scheduler/background-job-scope.service';
import connectToDatabase from '@/infrastructure/database/mongodb';

type CheckOverduePayload = object
interface SingleReminderPayload { _id: string; license_plate: string; title: string; due_date: string }

/**
 * Handles two job types on the shared 'process-reminders' / 'check-overdue'
 * queues: a per-organization overdue sweep (recurring, triggered via
 * queueService.scheduleOverdueCheck()) and a per-reminder due-date job
 * (delayed job, fired via queueService.addReminderJob at exactly the
 * reminder's due_date, giving a same-minute "it's due now" notification
 * distinct from the hourly overdue sweep).
 */
export class MaintenanceWorker extends BaseWorker<CheckOverduePayload | SingleReminderPayload> {
  constructor(queueName: 'check-overdue' | 'process-reminders') {
    super(queueName);
  }

  protected async process(jobName: string, payload: any, tenantId: string): Promise<void> {
    if (jobName === 'check-overdue') {
      /**
       * FIX (Phase D -- enterprise organization-aware background
       * processing): this previously called
       * `maintenanceCommandService.bulkUpdateOverdue('system')`, where
       * 'system' was documented as a pseudo-tenant meaning "no tenant
       * filter" -- i.e. this job silently updated overdue reminders for
       * EVERY organization on the platform in a single unscoped write.
       * That directly violates Phase D requirement 1 ("no background
       * job may ever operate against the whole database") and
       * requirement 8 ("never silently default to 'system' unless the
       * job is explicitly platform-wide" -- this job is not platform-
       * wide, it is per-organization maintenance data).
       *
       * The recurring trigger itself (queueService.scheduleOverdueCheck)
       * still only needs to fire once on a single cron schedule -- that
       * part is legitimately platform-level scheduling infrastructure,
       * not tenant data. What changes here is what happens when it
       * fires: instead of one unscoped call, this walks every active
       * organization (via BackgroundJobScopeService, which reuses
       * OrganizationRepository/TenantContextService -- no new hierarchy
       * or tenant-enumeration logic is implemented in this file) and
       * runs the sweep once per organization, scoped to that
       * organization's real tenantId. A failure resolving or processing
       * one organization is caught, audited, and skipped by
       * BackgroundJobScopeService -- it never falls back to an unscoped
       * call and never aborts the sweep for every other organization.
       */
      await backgroundJobScopeService.forEachOrganization('check-overdue', async (scope) => {
        await maintenanceCommandService.bulkUpdateOverdue(scope.organizationId);
      });
      return;
    }

    // process-single-reminder: fires right at due_date to give an
    // immediate "due today" nudge ahead of the next hourly overdue sweep.
    //
    // FIX (Phase D): the lookup previously filtered only by `_id`, with
    // no tenantId check -- a reminder document would be read and acted
    // on regardless of which organization it belonged to. The job's own
    // `tenantId` (set when queueService.addReminderJob() originally
    // enqueued this job) is now enforced as part of the query, so this
    // can never read or act on another organization's reminder even if
    // the payload's `_id` were somehow wrong.
    const reminder = payload as SingleReminderPayload;
    if (!reminder._id || !ObjectId.isValid(reminder._id)) return;

    const db = await connectToDatabase();
    const fresh = await db.collection('tblreminders').findOne({
      _id: new ObjectId(reminder._id),
      tenantId,
    });
    if (!fresh || fresh.status !== 'pending') return;

    await notificationService.sendMaintenanceUpcoming(fresh, tenantId);
  }
}