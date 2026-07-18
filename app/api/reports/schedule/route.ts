// app/api/reports/schedule/route.ts
//
// Legacy alias for scheduling a report. There's no separate "schedule"
// entity in modules/reporting — a schedule is just the `schedule` field on
// a ReportDefinition (see report-scheduler.service.ts). This route updates
// that field on the given definition and syncs it onto the cron catalogue,
// the same way report-definition.controller.ts#update does internally.
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';
import { reportBuilderService } from '@/modules/reporting/services/report-builder.service';
import { reportSchedulerService } from '@/modules/reporting/services/report-scheduler.service';
import { successResponse, errorResponse } from '@/server/utils/response.utils';
import { AppError } from '@/server/errors/app.errors';
import { validateWithZod } from '@/shared/utils/validation.utils';

const scheduleRequestSchema = z.object({
  reportDefinitionId: z.string().min(1),
  schedule: z.object({
    enabled: z.boolean(),
    frequency: z.enum(['daily', 'weekly', 'monthly']),
    dayOfWeek: z.number().int().min(0).max(6).optional(),
    dayOfMonth: z.number().int().min(1).max(28).optional(),
    hourOfDay: z.number().int().min(0).max(23),
    format: z.enum(['pdf', 'excel', 'csv', 'word', 'json']),
    recipients: z.array(z.string().email()).min(1),
  }),
});

export const POST = withAuth(
  async (req: NextRequest, context) => {
    try {
      const body = await req.json();
      const result = await validateWithZod(scheduleRequestSchema, body);
      if (!result.success || !result.data) {
        return errorResponse('Validation failed', 'VALIDATION_ERROR', 400, result.errors);
      }

      const { reportDefinitionId, schedule } = result.data;
      const updated = await reportBuilderService.update(
        reportDefinitionId,
        { schedule },
        context.tenantId,
        context.userId
      );
      await reportSchedulerService.syncSchedule(updated, context.tenantId, context.userId);

      return successResponse(updated);
    } catch (error) {
      if (error instanceof AppError) {
        return errorResponse(error.message, error.code, error.statusCode, error.details);
      }
      console.error('[POST /api/reports/schedule] Unexpected error:', error);
      return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
    }
  },
  { permission: Permission.REPORT_SCHEDULE }
);