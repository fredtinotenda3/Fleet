// modules/maintenance/commands/handlers/bulk-update-overdue.handler.ts

import { ICommandHandler } from '@/server/cqrs/command';
import { BulkUpdateOverdueCommand } from '../bulk-update-overdue.command';
import { MaintenanceRepository } from '@/modules/maintenance/repositories/maintenance.repository';
import { notificationService } from '@/modules/notifications/services/notification.service';

export interface BulkUpdateOverdueResult {
  updatedCount: number;
  newlyOverdueCount: number;
}

/**
 * Recalculates pending/overdue status across reminders and notifies the
 * assignee of each reminder that just became overdue. Invoked by the
 * scheduled jobs at /api/reminders/update-status and
 * /api/reminders/notify-overdue — both are now thin wrappers around this
 * one command so the two routes can no longer drift out of sync with
 * each other, which the original two independent implementations could.
 */
export class BulkUpdateOverdueHandler
  implements ICommandHandler<BulkUpdateOverdueCommand, BulkUpdateOverdueResult>
{
  constructor(private readonly maintenanceRepo: MaintenanceRepository) {}

  async execute(command: BulkUpdateOverdueCommand): Promise<BulkUpdateOverdueResult> {
    const { updatedCount, newlyOverdue } =
      await this.maintenanceRepo.recalculateOverdueStatuses(command.tenantId);

    for (const reminder of newlyOverdue) {
      try {
        // Notify using the reminder's OWN tenantId, not command.tenantId —
        // when this runs system-wide (tenantId: 'system') across every
        // tenant's reminders at once, each notification must still be
        // filed under its real tenant, not the pseudo-tenant used to
        // bypass the repository's tenant filter.
        await notificationService.sendMaintenanceOverdue(
          reminder,
          reminder.tenantId
        );
      } catch {
        // A notification failure must never roll back the status update.
      }
    }

    return {
      updatedCount,
      newlyOverdueCount: newlyOverdue.length,
    };
  }
}