// modules/workorders/controllers/workorder.controller.ts
import { NextRequest } from 'next/server';
import { workOrderService } from '../services/workorder.service';
import { WorkOrderFilters } from '../types/workorder.types';
import { validatePaginationParams } from '@/shared/utils/pagination.utils';
import { successResponse, paginatedResponse, errorResponse, createdResponse } from '@/server/utils/response.utils';
import { AppError, ValidationError } from '@/server/errors/app.errors';
import { getTenantFromRequest, getUserIdFromRequest } from '@/server/utils/context.utils';

export class WorkOrderController {
  async list(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const sp = req.nextUrl.searchParams;
      const filters: WorkOrderFilters = {
        license_plate: sp.get('license_plate') || undefined,
        status: (sp.get('status') as any) || undefined,
        priority: (sp.get('priority') as any) || undefined,
        assignedMechanicId: sp.get('assignedMechanicId') || undefined,
      };
      const { page, limit } = validatePaginationParams(sp.get('page'), sp.get('limit'));
      const result = await workOrderService.list(filters, { page, limit }, tenantId);
      return paginatedResponse(result.data, result.pagination);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async get(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      return successResponse(await workOrderService.get(id, tenantId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async create(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();
      return createdResponse(await workOrderService.create(body, tenantId, userId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async assign(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const { mechanicId, bayId } = await req.json();
      if (!mechanicId) throw new ValidationError('mechanicId is required');
      return successResponse(await workOrderService.assign(id, mechanicId, bayId, tenantId, userId));
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
      return successResponse(await workOrderService.changeStatus(id, status, tenantId, userId, reason));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async consumeParts(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const { sparePartId, quantity } = await req.json();
      if (!sparePartId || typeof quantity !== 'number') throw new ValidationError('sparePartId and quantity are required');
      return successResponse(await workOrderService.consumeParts(id, sparePartId, quantity, tenantId, userId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async recordLabor(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const { laborHours, hourlyRate } = await req.json();
      if (typeof laborHours !== 'number' || typeof hourlyRate !== 'number') throw new ValidationError('laborHours and hourlyRate are required');
      return successResponse(await workOrderService.recordLabor(id, laborHours, hourlyRate, tenantId, userId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  private handleError(error: unknown) {
    if (error instanceof AppError) return errorResponse(error.message, error.code, error.statusCode, error.details);
    console.error('[WorkOrderController] Unexpected error:', error);
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

export const workOrderController = new WorkOrderController();