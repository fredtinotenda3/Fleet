// modules/reporting/controllers/dashboard.controller.ts

import { NextRequest } from 'next/server';
import { AuthContext } from '@/server/auth/auth-context';
import { dashboardService } from '../services/dashboard.service';
import { successResponse, createdResponse, errorResponse } from '@/server/utils/response.utils';
import { AppError } from '@/server/errors/app.errors';
import { validateWithZod } from '@/shared/utils/validation.utils';
import { dashboardCreateSchema, dashboardUpdateSchema } from '@/shared/validations/dashboard.schema';

export class DashboardController {
  async list(req: NextRequest, context: AuthContext) {
    try {
      const executiveOnly = req.nextUrl.searchParams.get('executive') === 'true';
      const dashboards = executiveOnly
        ? await dashboardService.listExecutive(context.tenantId)
        : await dashboardService.list(context.tenantId);
      return successResponse(dashboards);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async get(req: NextRequest, context: AuthContext, id: string) {
    try {
      return successResponse(await dashboardService.get(id, context.tenantId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  /** No route wired yet -- see the render/download/evaluate note above. */
  async render(req: NextRequest, context: AuthContext, id: string) {
    try {
      return successResponse(await dashboardService.render(id, context.tenantId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async create(req: NextRequest, context: AuthContext) {
    try {
      const body = await req.json();
      const result = await validateWithZod(dashboardCreateSchema, body);
      if (!result.success || !result.data) {
        return errorResponse('Validation failed', 'VALIDATION_ERROR', 400, result.errors);
      }
      const created = await dashboardService.create(result.data, context.tenantId, context.userId);
      return createdResponse(created);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async update(req: NextRequest, context: AuthContext, id: string) {
    try {
      const body = await req.json();
      const result = await validateWithZod(dashboardUpdateSchema, body);
      if (!result.success || !result.data) {
        return errorResponse('Validation failed', 'VALIDATION_ERROR', 400, result.errors);
      }
      const updated = await dashboardService.update(id, result.data, context.tenantId, context.userId);
      return successResponse(updated);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async delete(req: NextRequest, context: AuthContext, id: string) {
    try {
      await dashboardService.delete(id, context.tenantId, context.userId);
      return successResponse({ message: 'Dashboard deleted successfully' });
    } catch (error) {
      return this.handleError(error);
    }
  }

  private handleError(error: unknown) {
    if (error instanceof AppError) {
      return errorResponse(error.message, error.code, error.statusCode, error.details);
    }
    console.error('[DashboardController] Unexpected error:', error);
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

export const dashboardController = new DashboardController();