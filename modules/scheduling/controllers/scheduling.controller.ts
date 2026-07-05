// modules/scheduling/controllers/scheduling.controller.ts
import { NextRequest } from 'next/server';
import { schedulingService } from '../services/scheduling.service';
import { DriverShiftFilters } from '../types/scheduling.types';
import { validatePaginationParams } from '@/shared/utils/pagination.utils';
import { successResponse, paginatedResponse, errorResponse, createdResponse } from '@/server/utils/response.utils';
import { AppError } from '@/server/errors/app.errors';
import { getTenantFromRequest, getUserIdFromRequest } from '@/server/utils/context.utils';

export class SchedulingController {
  async list(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const sp = req.nextUrl.searchParams;
      const filters: DriverShiftFilters = {
        driverId: sp.get('driverId') || undefined,
        vehicleId: sp.get('vehicleId') || undefined,
        status: (sp.get('status') as any) || undefined,
        startDate: sp.get('start') ? new Date(sp.get('start')!) : undefined,
        endDate: sp.get('end') ? new Date(sp.get('end')!) : undefined,
      };
      const { page, limit } = validatePaginationParams(sp.get('page'), sp.get('limit'));
      const result = await schedulingService.list(filters, { page, limit }, tenantId);
      return paginatedResponse(result.data, result.pagination);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async get(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      return successResponse(await schedulingService.get(id, tenantId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async create(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();
      return createdResponse(await schedulingService.createShift(body, tenantId, userId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async update(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();
      return successResponse(await schedulingService.updateShift(id, body, tenantId, userId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async start(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      return successResponse(await schedulingService.startShift(id, tenantId, userId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async complete(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      return successResponse(await schedulingService.completeShift(id, tenantId, userId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async cancel(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      return successResponse(await schedulingService.cancelShift(id, tenantId, userId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  private handleError(error: unknown) {
    if (error instanceof AppError) return errorResponse(error.message, error.code, error.statusCode, error.details);
    console.error('[SchedulingController] Unexpected error:', error);
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

export const schedulingController = new SchedulingController();