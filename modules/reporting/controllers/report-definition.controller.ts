// modules/reporting/controllers/report-definition.controller.ts

import { NextRequest } from 'next/server';
import { AuthContext } from '@/server/auth/auth-context';
import { reportBuilderService } from '../services/report-builder.service';
import { reportSchedulerService } from '../services/report-scheduler.service';
import { successResponse, createdResponse, errorResponse } from '@/server/utils/response.utils';
import { AppError } from '@/server/errors/app.errors';
import { validateWithZod } from '@/shared/utils/validation.utils';
import {
  reportDefinitionCreateSchema,
  reportDefinitionUpdateSchema,
} from '@/shared/validations/report-definition.schema';

export class ReportDefinitionController {
  async list(req: NextRequest, context: AuthContext) {
    try {
      return successResponse(await reportBuilderService.list(context.tenantId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async get(req: NextRequest, context: AuthContext, id: string) {
    try {
      return successResponse(await reportBuilderService.get(id, context.tenantId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  /** No route yet -- runs the definition and returns a tabular preview for the builder UI. */
  async preview(req: NextRequest, context: AuthContext, id: string) {
    try {
      return successResponse(await reportBuilderService.preview(id, context.tenantId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  /** No route yet -- pivot-shaped preview, only valid when the definition has a saved pivot config. */
  async previewPivot(req: NextRequest, context: AuthContext, id: string) {
    try {
      return successResponse(await reportBuilderService.previewPivot(id, context.tenantId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  /** No route yet. */
  async duplicate(req: NextRequest, context: AuthContext, id: string) {
    try {
      const duplicated = await reportBuilderService.duplicate(id, context.tenantId, context.userId);
      return createdResponse(duplicated);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async create(req: NextRequest, context: AuthContext) {
    try {
      const body = await req.json();
      const result = await validateWithZod(reportDefinitionCreateSchema, body);
      if (!result.success || !result.data) {
        return errorResponse('Validation failed', 'VALIDATION_ERROR', 400, result.errors);
      }
      const created = await reportBuilderService.create(result.data, context.tenantId, context.userId);

      // Wires ReportDefinition.schedule onto the platform cron catalogue.
      // Deliberately called here (not inside ReportBuilderService, per that
      // service's own comment) rather than silently skipped.
      if (created.schedule) {
        await reportSchedulerService.syncSchedule(created, context.tenantId, context.userId);
      }

      return createdResponse(created);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async update(req: NextRequest, context: AuthContext, id: string) {
    try {
      const body = await req.json();
      const result = await validateWithZod(reportDefinitionUpdateSchema, body);
      if (!result.success || !result.data) {
        return errorResponse('Validation failed', 'VALIDATION_ERROR', 400, result.errors);
      }
      const updated = await reportBuilderService.update(id, result.data, context.tenantId, context.userId);
      await reportSchedulerService.syncSchedule(updated, context.tenantId, context.userId);
      return successResponse(updated);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async delete(req: NextRequest, context: AuthContext, id: string) {
    try {
      await reportSchedulerService.removeSchedule(id, context.userId);
      await reportBuilderService.delete(id, context.tenantId, context.userId);
      return successResponse({ message: 'Report definition deleted successfully' });
    } catch (error) {
      return this.handleError(error);
    }
  }

  private handleError(error: unknown) {
    if (error instanceof AppError) {
      return errorResponse(error.message, error.code, error.statusCode, error.details);
    }
    console.error('[ReportDefinitionController] Unexpected error:', error);
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

export const reportDefinitionController = new ReportDefinitionController();