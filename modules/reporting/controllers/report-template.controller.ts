// modules/reporting/controllers/report-template.controller.ts

import { NextRequest } from 'next/server';
import { AuthContext } from '@/server/auth/auth-context';
import { reportTemplateService } from '../services/report-template.service';
import { successResponse, createdResponse, errorResponse } from '@/server/utils/response.utils';
import { AppError } from '@/server/errors/app.errors';
import { validateWithZod } from '@/shared/utils/validation.utils';
import {
  reportTemplateCreateSchema,
  reportTemplateInstantiateSchema,
} from '@/shared/validations/report-template.schema';

export class ReportTemplateController {
  async list(req: NextRequest, context: AuthContext) {
    try {
      return successResponse(await reportTemplateService.listVisible(context.tenantId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async get(req: NextRequest, context: AuthContext, id: string) {
    try {
      return successResponse(await reportTemplateService.get(id, context.tenantId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  /** No route yet -- clones a template's saved definition into a live, tenant-owned ReportDefinition. */
  async instantiate(req: NextRequest, context: AuthContext, id: string) {
    try {
      const body = await req.json().catch(() => ({}));
      const result = await validateWithZod(reportTemplateInstantiateSchema, body);
      if (!result.success) {
        return errorResponse('Validation failed', 'VALIDATION_ERROR', 400, result.errors);
      }
      const definition = await reportTemplateService.instantiate(
        id,
        context.tenantId,
        context.userId,
        result.data?.name
      );
      return createdResponse(definition);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async create(req: NextRequest, context: AuthContext) {
    try {
      const body = await req.json();
      const result = await validateWithZod(reportTemplateCreateSchema, body);
      if (!result.success || !result.data) {
        return errorResponse('Validation failed', 'VALIDATION_ERROR', 400, result.errors);
      }
      const created = await reportTemplateService.create(result.data, context.tenantId, context.userId);
      return createdResponse(created);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async delete(req: NextRequest, context: AuthContext, id: string) {
    try {
      await reportTemplateService.delete(id, context.tenantId, context.userId);
      return successResponse({ message: 'Report template deleted successfully' });
    } catch (error) {
      return this.handleError(error);
    }
  }

  private handleError(error: unknown) {
    if (error instanceof AppError) {
      return errorResponse(error.message, error.code, error.statusCode, error.details);
    }
    console.error('[ReportTemplateController] Unexpected error:', error);
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

export const reportTemplateController = new ReportTemplateController();