// workers/maintenance.worker.ts

import { ObjectId } from 'mongodb';
import { BaseWorker } from '@/infrastructure/queue/worker-base.service';
import { maintenanceCommandService } from '@/modules/maintenance/services/maintenance-command.service';
import { notificationService } from '@/modules/notifications/services/notification.service';
import connectToDatabase from '@/infrastructure/database/mongodb';

type CheckOverduePayload = object
interface SingleReminderPayload { _id: string; license_plate: string; title: string; due_date: string }

/**
 * Handles two job types on the shared 'process-reminders' / 'check-overdue'
 * queues: a system-wide overdue sweep (recurring, via
 * bootstrap-schedules.ts) and a per-reminder due-date job (delayed job,
 * fired via queueService.addReminderJob at exactly the reminder's
 * due_date, giving a same-minute "it's due now" notification distinct
 * from the hourly overdue sweep).
 */
export class MaintenanceWorker extends BaseWorker<CheckOverduePayload | SingleReminderPayload> {
  constructor(queueName: 'check-overdue' | 'process-reminders') {
    super(queueName);
  }

  protected async process(jobName: string, payload: any, tenantId: string): Promise<void> {
    if (jobName === 'check-overdue') {
      // Runs across every tenant in one pass; bulkUpdateOverdue already
      // accepts 'system' as a pseudo-tenant meaning "no tenant filter".
      await maintenanceCommandService.bulkUpdateOverdue('system');
      return;
    }

    // process-single-reminder: fires right at due_date to give an
    // immediate "due today" nudge ahead of the next hourly overdue sweep.
    const reminder = payload as SingleReminderPayload;
    const db = await connectToDatabase();
    const fresh = await db.collection('tblreminders').findOne({ _id: reminder._id ? new ObjectId(reminder._id) : undefined });
    if (!fresh || fresh.status !== 'pending') return;

    await notificationService.sendMaintenanceUpcoming(fresh, fresh.tenantId || tenantId);
  }
}