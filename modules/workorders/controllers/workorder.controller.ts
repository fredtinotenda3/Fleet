// modules/workorders/controllers/workorder.controller.ts
import { NextRequest } from 'next/server';
import { workOrderService } from '../services/workorder.service';
import { WorkOrderFilters } from '../types/workorder.types';
import { validatePaginationParams } from '@/shared/utils/pagination.utils';
import { successResponse, paginatedResponse, errorResponse, createdResponse } from '@/server/utils/response.utils';
import { AppError, ValidationError } from '@/server/errors/app.errors';
import { getUserIdFromRequest } from '@/server/utils/context.utils';
import { resolveTenantContext } from '@/server/utils/tenant-context.utils';
import { userWriteScope } from '@/server/tenancy/write-scope';

export class WorkOrderController {
  /*
    Every method below now resolves a full TenantContext rather than a
    bare tenantId. Only `create` did before, and the consequence was
    that a workshop manager scoped to one workshop could list, read,
    reassign, cancel and consume parts against EVERY branch's work
    orders. See WorkOrderService.assertInScope for the detail.
  */
  async list(req: NextRequest) {
    try {
      const context = await resolveTenantContext(req);
      const sp = req.nextUrl.searchParams;
      const filters: WorkOrderFilters = {
        license_plate: sp.get('license_plate') || undefined,
        status: (sp.get('status') as any) || undefined,
        priority: (sp.get('priority') as any) || undefined,
        assignedMechanicId: sp.get('assignedMechanicId') || undefined,
      };
      const { page, limit } = validatePaginationParams(sp.get('page'), sp.get('limit'));
      const result = await workOrderService.listInScope(filters, { page, limit }, context);
      return paginatedResponse(result.data, result.pagination);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async get(req: NextRequest, id: string) {
    try {
      const context = await resolveTenantContext(req);
      return successResponse(await workOrderService.get(id, context));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async create(req: NextRequest) {
    try {
      /**
       * SCOPE FIX. This resolved only a tenantId, so raising a work
       * order was never org-unit scope-checked: a workshop manager
       * could open a job against any vehicle in the organization and it
       * would land in the owning branch's queue.
       */
      const context = await resolveTenantContext(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();
      return createdResponse(await workOrderService.create(body, userWriteScope(context), userId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async assign(req: NextRequest, id: string) {
    try {
      const context = await resolveTenantContext(req);
      const userId = await getUserIdFromRequest(req);
      const { mechanicId, bayId } = await req.json();
      if (!mechanicId) throw new ValidationError('mechanicId is required');
      return successResponse(await workOrderService.assign(id, mechanicId, bayId, context, userId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async changeStatus(req: NextRequest, id: string) {
    try {
      const context = await resolveTenantContext(req);
      const userId = await getUserIdFromRequest(req);
      const { status, reason } = await req.json();
      if (!status) throw new ValidationError('status is required');
      return successResponse(await workOrderService.changeStatus(id, status, context, userId, reason));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async consumeParts(req: NextRequest, id: string) {
    try {
      const context = await resolveTenantContext(req);
      const userId = await getUserIdFromRequest(req);
      const { sparePartId, quantity } = await req.json();
      if (!sparePartId || typeof quantity !== 'number') throw new ValidationError('sparePartId and quantity are required');
      return successResponse(await workOrderService.consumeParts(id, sparePartId, quantity, context, userId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async recordLabor(req: NextRequest, id: string) {
    try {
      const context = await resolveTenantContext(req);
      const userId = await getUserIdFromRequest(req);
      const { laborHours, hourlyRate } = await req.json();
      if (typeof laborHours !== 'number' || typeof hourlyRate !== 'number') throw new ValidationError('laborHours and hourlyRate are required');
      return successResponse(await workOrderService.recordLabor(id, laborHours, hourlyRate, context, userId));
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