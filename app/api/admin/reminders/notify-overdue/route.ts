// app/api/admin/reminders/notify-overdue/route.ts
//
// FIX (Phase D finalization): restores this manual/on-demand trigger.
// bootstrap-schedules.ts registers a single schedule for this job --
// 'reminders-overdue-check' (JobType.CHECK_OVERDUE) -- described in its
// own definition as marking overdue reminders "and notify[ing]
// assignees" in one operation, not two. There is no separate
// notify-only command exposed by MaintenanceCommandService (it has
// createReminder/updateReminder/deleteReminder/completeReminder/
// bulkUpdateOverdue -- nothing else), which confirms notification
// dispatch already happens inside bulkUpdateOverdue's command handler
// alongside the status change, exactly like the single-reminder
// due-now path in workers/maintenance.worker.ts calls
// notificationService.sendMaintenanceUpcoming() as part of the same
// unit of work. This route is therefore a thin, intentionally-identical
// sibling of update-status/route.ts -- both are manual triggers for the
// one real operation -- kept as a separate route only because the
// original two-route naming (.../update-status and .../notify-overdue)
// is still referenced elsewhere (bootstrap-schedules.ts's comment) as
// two distinct external trigger URLs. No new business logic is
// introduced.

import { NextRequest } from 'next/server';
import { maintenanceCommandService } from '@/modules/maintenance/services/maintenance-command.service';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';
import { successResponse, errorResponse } from '@/server/utils/response.utils';
import { AppError } from '@/server/errors/app.errors';

export const POST = withAuth(
  async (_req: NextRequest, context) => {
    try {
      const result = await maintenanceCommandService.bulkUpdateOverdue(
        context.tenantId,
        context.userId
      );
      return successResponse(result);
    } catch (error) {
      if (error instanceof AppError) {
        return errorResponse(error.message, error.code, error.statusCode, error.details);
      }
      console.error('[POST /api/admin/reminders/notify-overdue] Unexpected error:', error);
      return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
    }
  },
  { permission: Permission.MAINTENANCE_EDIT }
);