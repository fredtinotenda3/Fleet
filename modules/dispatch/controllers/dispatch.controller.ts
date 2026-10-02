// modules/dispatch/controllers/dispatch.controller.ts
import { NextRequest } from 'next/server';
import { dispatchService } from '../services/dispatch.service';
import { DispatchFilters } from '../types/dispatch.types';
import { validatePaginationParams } from '@/shared/utils/pagination.utils';
import { successResponse, paginatedResponse, errorResponse, createdResponse } from '@/server/utils/response.utils';
import { AppError, ValidationError } from '@/server/errors/app.errors';
import { getUserIdFromRequest } from '@/server/utils/context.utils';
import { resolveTenantContext } from '@/server/utils/tenant-context.utils';
import { userWriteScope } from '@/server/tenancy/write-scope';

export class DispatchController {
  /*
    ROUND 4 FIX -- every method below now resolves a full TenantContext
    rather than a bare tenantId, mirroring the identical fix already
    applied to WorkOrderController (see that file's own header comment).
    Only `create` did this before; the consequence was that a Fleet
    Manager scoped to one branch could list, read, assign, and complete
    every OTHER branch's dispatch jobs too. See DispatchService's
    assertInScope for the detail.
  */
  async list(req: NextRequest) {
    try {
      const context = await resolveTenantContext(req);
      const sp = req.nextUrl.searchParams;
      const filters: DispatchFilters = {
        status: (sp.get('status') as DispatchFilters['status']) || undefined,
        priority: (sp.get('priority') as DispatchFilters['priority']) || undefined,
        assignedDriverId: sp.get('assignedDriverId') || undefined,
        assignedVehicleId: sp.get('assignedVehicleId') || undefined,
      };
      const { page, limit } = validatePaginationParams(sp.get('page'), sp.get('limit'));
      const result = await dispatchService.listInScope(filters, { page, limit }, context);
      return paginatedResponse(result.data, result.pagination);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async board(req: NextRequest) {
    try {
      const context = await resolveTenantContext(req);
      return successResponse(await dispatchService.getBoardInScope(context));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async get(req: NextRequest, id: string) {
    try {
      const context = await resolveTenantContext(req);
      return successResponse(await dispatchService.get(id, context));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async create(req: NextRequest) {
    try {
      const context = await resolveTenantContext(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();
      return createdResponse(await dispatchService.create(body, userWriteScope(context), userId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async assign(req: NextRequest, id: string) {
    try {
      const context = await resolveTenantContext(req);
      const userId = await getUserIdFromRequest(req);
      const { driverId, vehicleId } = await req.json();
      if (!driverId || !vehicleId) throw new ValidationError('driverId and vehicleId are required');
      return successResponse(await dispatchService.assign(id, driverId, vehicleId, userWriteScope(context), userId));
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
      return successResponse(await dispatchService.changeStatus(id, status, userWriteScope(context), userId, reason));
    } catch (error) {
      return this.handleError(error);
    }
  }

  /** TRIP -> DISPATCH direction: associate an existing, independently-logged trip with this job. */
  async linkTrip(req: NextRequest, id: string) {
    try {
      const context = await resolveTenantContext(req);
      const userId = await getUserIdFromRequest(req);
      const { tripId } = await req.json();
      if (!tripId) throw new ValidationError('tripId is required');
      return successResponse(await dispatchService.linkExistingTrip(id, tripId, userWriteScope(context), userId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  /** Honest cost summary -- see DispatchService.getCostSummary's doc comment. */
  async cost(req: NextRequest, id: string) {
    try {
      const context = await resolveTenantContext(req);
      return successResponse(await dispatchService.getCostSummary(id, context));
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
