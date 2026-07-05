
// modules/reporting/controllers/report-definition.controller.ts

import { NextRequest } from 'next/server';
import { reportBuilderService } from '../services/report-builder.service';
import { reportSchedulerService } from '../services/report-scheduler.service';
import { drilldownService } from '../services/drilldown.service';
import { AuthContext } from '@/server/auth/auth-context';
import { successResponse, createdResponse, errorResponse } from '@/server/utils/response.utils';
import { AppError } from '@/server/errors/app.errors';
import { reportDefinitionCreateSchema, reportDefinitionUpdateSchema } from '@/shared/validations/report-definition.schema';

export class ReportDefinitionController {
  async list(_req: NextRequest, context: AuthContext) {
    try {
      return successResponse(await reportBuilderService.list(context.tenantId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async create(req: NextRequest, context: AuthContext) {
    try {
      const body = await req.json();
      const parsed = reportDefinitionCreateSchema.safeParse(body);
      if (!parsed.success) return errorResponse('Invalid report definition', 'VALIDATION_ERROR', 400, parsed.error.flatten());

      const created = await reportBuilderService.create(parsed.data, context.tenantId, context.userId);
      await reportSchedulerService.syncSchedule(created, context.tenantId, context.userId);
      return createdResponse(created);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getById(_req: NextRequest, context: AuthContext, params: { id: string }) {
    try {
      return successResponse(await reportBuilderService.get(params.id, context.tenantId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async update(req: NextRequest, context: AuthContext, params: { id: string }) {
    try {
      const body = await req.json();
      const parsed = reportDefinitionUpdateSchema.safeParse(body);
      if (!parsed.success) return errorResponse('Invalid report definition', 'VALIDATION_ERROR', 400, parsed.error.flatten());

      const updated = await reportBuilderService.update(params.id, parsed.data, context.tenantId, context.userId);
      await reportSchedulerService.syncSchedule(updated, context.tenantId, context.userId);
      return successResponse(updated);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async delete(_req: NextRequest, context: AuthContext, params: { id: string }) {
    try {
      await reportSchedulerService.removeSchedule(params.id, context.userId);
      await reportBuilderService.delete(params.id, context.tenantId, context.userId);
      return successResponse({ deleted: true });
    } catch (error) {
      return this.handleError(error);
    }
  }

  async duplicate(_req: NextRequest, context: AuthContext, params: { id: string }) {
    try {
      return createdResponse(await reportBuilderService.duplicate(params.id, context.tenantId, context.userId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async preview(_req: NextRequest, context: AuthContext, params: { id: string }) {
    try {
      return successResponse(await reportBuilderService.preview(params.id, context.tenantId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async previewPivot(_req: NextRequest, context: AuthContext, params: { id: string }) {
    try {
      return successResponse(await reportBuilderService.previewPivot(params.id, context.tenantId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async drilldown(req: NextRequest, context: AuthContext, params: { id: string }) {
    try {
      const body = await req.json();
      const definition = await reportBuilderService.get(params.id, context.tenantId);
      const result = await drilldownService.drillInto(definition, context.tenantId, body.groupValues ?? {});
      return successResponse(result);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private handleError(error: unknown) {
    if (error instanceof AppError) return errorResponse(error.message, error.code, error.statusCode, error.details);
    console.error('[ReportDefinitionController] Unexpected error:', error);
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

export const reportDefinitionController = new ReportDefinitionController();