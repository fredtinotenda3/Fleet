// app/api/admin/reminders/update-status/route.ts
//
// FIX (Phase D finalization): restores this manual/on-demand trigger,
// which bootstrap-schedules.ts's own comment on the 'reminders-overdue-
// check' schedule references as still needing to "work as manual/
// external triggers" alongside the recurring cron path. It does not
// reimplement any overdue-detection or tenant-scoping logic -- it calls
// the exact same maintenanceCommandService.bulkUpdateOverdue(tenantId)
// that workers/maintenance.worker.ts's 'check-overdue' cron handler
// calls once per organization via BackgroundJobScopeService. Here it
// runs for the caller's own organization only (withAuth's
// context.tenantId), which is the correct scope for an admin manually
// re-triggering the sweep for their own org rather than the whole
// platform.

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
      console.error('[POST /api/admin/reminders/update-status] Unexpected error:', error);
      return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
    }
  },
  { permission: Permission.MAINTENANCE_EDIT }
);