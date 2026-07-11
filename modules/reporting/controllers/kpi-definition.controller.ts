// modules/reporting/controllers/kpi-definition.controller.ts

import { NextRequest } from 'next/server';
import { AuthContext } from '@/server/auth/auth-context';
import { kpiDefinitionService } from '../services/kpi-definition.service';
import { successResponse, createdResponse, errorResponse } from '@/server/utils/response.utils';
import { AppError } from '@/server/errors/app.errors';
import { validateWithZod } from '@/shared/utils/validation.utils';
import { kpiDefinitionCreateSchema, kpiDefinitionUpdateSchema } from '@/shared/validations/kpi-definition.schema';

export class KpiDefinitionController {
  async list(req: NextRequest, context: AuthContext) {
    try {
      return successResponse(await kpiDefinitionService.list(context.tenantId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async get(req: NextRequest, context: AuthContext, id: string) {
    try {
      return successResponse(await kpiDefinitionService.get(id, context.tenantId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  /** No dedicated route yet -- powers a single KPI's value, distinct from evaluateAll below. */
  async evaluate(req: NextRequest, context: AuthContext, id: string) {
    try {
      return successResponse(await kpiDefinitionService.evaluate(id, context.tenantId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async evaluateAll(req: NextRequest, context: AuthContext) {
    try {
      return successResponse(await kpiDefinitionService.evaluateAll(context.tenantId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async create(req: NextRequest, context: AuthContext) {
    try {
      const body = await req.json();
      const result = await validateWithZod(kpiDefinitionCreateSchema, body);
      if (!result.success || !result.data) {
        return errorResponse('Validation failed', 'VALIDATION_ERROR', 400, result.errors);
      }
      const created = await kpiDefinitionService.create(result.data, context.tenantId, context.userId);
      return createdResponse(created);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async update(req: NextRequest, context: AuthContext, id: string) {
    try {
      const body = await req.json();
      const result = await validateWithZod(kpiDefinitionUpdateSchema, body);
      if (!result.success || !result.data) {
        return errorResponse('Validation failed', 'VALIDATION_ERROR', 400, result.errors);
      }
      const updated = await kpiDefinitionService.update(id, result.data, context.tenantId, context.userId);
      return successResponse(updated);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async delete(req: NextRequest, context: AuthContext, id: string) {
    try {
      await kpiDefinitionService.delete(id, context.tenantId, context.userId);
      return successResponse({ message: 'KPI definition deleted successfully' });
    } catch (error) {
      return this.handleError(error);
    }
  }

  private handleError(error: unknown) {
    if (error instanceof AppError) {
      return errorResponse(error.message, error.code, error.statusCode, error.details);
    }
    console.error('[KpiDefinitionController] Unexpected error:', error);
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

export const kpiDefinitionController = new KpiDefinitionController();