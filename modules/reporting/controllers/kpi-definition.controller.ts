
// modules/reporting/controllers/kpi-definition.controller.ts

import { NextRequest } from 'next/server';
import { kpiDefinitionService } from '../services/kpi-definition.service';
import { AuthContext } from '@/server/auth/auth-context';
import { successResponse, createdResponse, errorResponse } from '@/server/utils/response.utils';
import { AppError } from '@/server/errors/app.errors';
import { kpiDefinitionCreateSchema, kpiDefinitionUpdateSchema } from '@/shared/validations/kpi-definition.schema';

export class KpiDefinitionController {
  async list(_req: NextRequest, context: AuthContext) {
    try {
      return successResponse(await kpiDefinitionService.list(context.tenantId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async create(req: NextRequest, context: AuthContext) {
    try {
      const body = await req.json();
      const parsed = kpiDefinitionCreateSchema.safeParse(body);
      if (!parsed.success) return errorResponse('Invalid KPI definition', 'VALIDATION_ERROR', 400, parsed.error.flatten());
      return createdResponse(await kpiDefinitionService.create(parsed.data, context.tenantId, context.userId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getById(_req: NextRequest, context: AuthContext, params: { id: string }) {
    try {
      return successResponse(await kpiDefinitionService.get(params.id, context.tenantId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async update(req: NextRequest, context: AuthContext, params: { id: string }) {
    try {
      const body = await req.json();
      const parsed = kpiDefinitionUpdateSchema.safeParse(body);
      if (!parsed.success) return errorResponse('Invalid KPI definition', 'VALIDATION_ERROR', 400, parsed.error.flatten());
      const updated = await kpiDefinitionService.update(params.id, { _id: params.id, ...parsed.data }, context.tenantId, context.userId);
      return successResponse(updated);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async delete(_req: NextRequest, context: AuthContext, params: { id: string }) {
    try {
      await kpiDefinitionService.delete(params.id, context.tenantId, context.userId);
      return successResponse({ deleted: true });
    } catch (error) {
      return this.handleError(error);
    }
  }

  async evaluate(_req: NextRequest, context: AuthContext, params: { id: string }) {
    try {
      return successResponse(await kpiDefinitionService.evaluate(params.id, context.tenantId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async evaluateAll(_req: NextRequest, context: AuthContext) {
    try {
      return successResponse(await kpiDefinitionService.evaluateAll(context.tenantId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  private handleError(error: unknown) {
    if (error instanceof AppError) return errorResponse(error.message, error.code, error.statusCode, error.details);
    console.error('[KpiDefinitionController] Unexpected error:', error);
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

export const kpiDefinitionController = new KpiDefinitionController();