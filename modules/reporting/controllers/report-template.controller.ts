
// modules/reporting/controllers/report-template.controller.ts

import { NextRequest } from 'next/server';
import { reportTemplateService } from '../services/report-template.service';
import { AuthContext } from '@/server/auth/auth-context';
import { successResponse, createdResponse, errorResponse } from '@/server/utils/response.utils';
import { AppError } from '@/server/errors/app.errors';
import { reportTemplateCreateSchema, reportTemplateInstantiateSchema } from '@/shared/validations/report-template.schema';

export class ReportTemplateController {
  async list(_req: NextRequest, context: AuthContext) {
    try {
      return successResponse(await reportTemplateService.listVisible(context.tenantId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async create(req: NextRequest, context: AuthContext) {
    try {
      const body = await req.json();
      const parsed = reportTemplateCreateSchema.safeParse(body);
      if (!parsed.success) return errorResponse('Invalid report template', 'VALIDATION_ERROR', 400, parsed.error.flatten());
      return createdResponse(await reportTemplateService.create(parsed.data, context.tenantId, context.userId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async delete(_req: NextRequest, context: AuthContext, params: { id: string }) {
    try {
      await reportTemplateService.delete(params.id, context.tenantId, context.userId);
      return successResponse({ deleted: true });
    } catch (error) {
      return this.handleError(error);
    }
  }

  async instantiate(req: NextRequest, context: AuthContext, params: { id: string }) {
    try {
      const body = await req.json().catch(() => ({}));
      const parsed = reportTemplateInstantiateSchema.safeParse(body);
      if (!parsed.success) return errorResponse('Invalid request', 'VALIDATION_ERROR', 400, parsed.error.flatten());
      const created = await reportTemplateService.instantiate(params.id, context.tenantId, context.userId, parsed.data.name);
      return createdResponse(created);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private handleError(error: unknown) {
    if (error instanceof AppError) return errorResponse(error.message, error.code, error.statusCode, error.details);
    console.error('[ReportTemplateController] Unexpected error:', error);
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

export const reportTemplateController = new ReportTemplateController();