// modules/dispatch/controllers/dispatch.controller.ts
import { NextRequest } from 'next/server';
import { dispatchService } from '../services/dispatch.service';
import { DispatchFilters } from '../types/dispatch.types';
import { validatePaginationParams } from '@/shared/utils/pagination.utils';
import { successResponse, paginatedResponse, errorResponse, createdResponse } from '@/server/utils/response.utils';
import { AppError, ValidationError } from '@/server/errors/app.errors';
import { getTenantFromRequest, getUserIdFromRequest } from '@/server/utils/context.utils';

export class DispatchController {
  async list(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const sp = req.nextUrl.searchParams;
      const filters: DispatchFilters = {
        status: (sp.get('status') as any) || undefined,
        priority: (sp.get('priority') as any) || undefined,
        assignedDriverId: sp.get('assignedDriverId') || undefined,
        assignedVehicleId: sp.get('assignedVehicleId') || undefined,
      };
      const { page, limit } = validatePaginationParams(sp.get('page'), sp.get('limit'));
      const result = await dispatchService.list(filters, { page, limit }, tenantId);
      return paginatedResponse(result.data, result.pagination);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async board(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      return successResponse(await dispatchService.getBoard(tenantId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async get(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      return successResponse(await dispatchService.get(id, tenantId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async create(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();
      return createdResponse(await dispatchService.create(body, tenantId, userId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async assign(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const { driverId, vehicleId } = await req.json();
      if (!driverId || !vehicleId) throw new ValidationError('driverId and vehicleId are required');
      return successResponse(await dispatchService.assign(id, driverId, vehicleId, tenantId, userId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async changeStatus(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const { status, reason } = await req.json();
      if (!status) throw new ValidationError('status is required');
      return successResponse(await dispatchService.changeStatus(id, status, tenantId, userId, reason));
    } catch (error) {
      return this.handleError(error);
    }
  }

  private handleError(error: unknown) {
    if (error instanceof AppError) return errorResponse(error.message, error.code, error.statusCode, error.details);
    console.error('[DispatchController] Unexpected error:', error);
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

export const dispatchController = new DispatchController();