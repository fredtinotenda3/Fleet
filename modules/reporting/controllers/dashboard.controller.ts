
// modules/reporting/controllers/dashboard.controller.ts

import { NextRequest } from 'next/server';
import { dashboardService } from '../services/dashboard.service';
import { AuthContext } from '@/server/auth/auth-context';
import { successResponse, createdResponse, errorResponse } from '@/server/utils/response.utils';
import { AppError } from '@/server/errors/app.errors';
import { dashboardCreateSchema, dashboardUpdateSchema } from '@/shared/validations/dashboard.schema';

export class DashboardController {
  async list(_req: NextRequest, context: AuthContext) {
    try {
      return successResponse(await dashboardService.list(context.tenantId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async listExecutive(_req: NextRequest, context: AuthContext) {
    try {
      return successResponse(await dashboardService.listExecutive(context.tenantId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async create(req: NextRequest, context: AuthContext) {
    try {
      const body = await req.json();
      const parsed = dashboardCreateSchema.safeParse(body);
      if (!parsed.success) return errorResponse('Invalid dashboard', 'VALIDATION_ERROR', 400, parsed.error.flatten());
      return createdResponse(await dashboardService.create(parsed.data, context.tenantId, context.userId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getById(_req: NextRequest, context: AuthContext, params: { id: string }) {
    try {
      return successResponse(await dashboardService.get(params.id, context.tenantId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async update(req: NextRequest, context: AuthContext, params: { id: string }) {
    try {
      const body = await req.json();
      const parsed = dashboardUpdateSchema.safeParse(body);
      if (!parsed.success) return errorResponse('Invalid dashboard', 'VALIDATION_ERROR', 400, parsed.error.flatten());
      const updated = await dashboardService.update(params.id, { _id: params.id, ...parsed.data }, context.tenantId, context.userId);
      return successResponse(updated);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async delete(_req: NextRequest, context: AuthContext, params: { id: string }) {
    try {
      await dashboardService.delete(params.id, context.tenantId, context.userId);
      return successResponse({ deleted: true });
    } catch (error) {
      return this.handleError(error);
    }
  }

  async data(_req: NextRequest, context: AuthContext, params: { id: string }) {
    try {
      return successResponse(await dashboardService.render(params.id, context.tenantId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  private handleError(error: unknown) {
    if (error instanceof AppError) return errorResponse(error.message, error.code, error.statusCode, error.details);
    console.error('[DashboardController] Unexpected error:', error);
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

export const dashboardController = new DashboardController();