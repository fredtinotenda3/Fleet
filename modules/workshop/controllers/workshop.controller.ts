// modules/workshop/controllers/workshop.controller.ts
import { NextRequest } from 'next/server';
import { workshopService } from '../services/workshop.service';
import { validatePaginationParams } from '@/shared/utils/pagination.utils';
import { successResponse, paginatedResponse, errorResponse, createdResponse } from '@/server/utils/response.utils';
import { AppError, ValidationError } from '@/server/errors/app.errors';
import { getTenantFromRequest, getUserIdFromRequest } from '@/server/utils/context.utils';

export class WorkshopController {
  async listBays(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const sp = req.nextUrl.searchParams;
      const { page, limit } = validatePaginationParams(sp.get('page'), sp.get('limit'));
      const result = await workshopService.listBays(sp.get('status') || undefined, { page, limit }, tenantId);
      return paginatedResponse(result.data, result.pagination);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getBay(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      return successResponse(await workshopService.getBay(id, tenantId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async createBay(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();
      return createdResponse(await workshopService.createBay(body, tenantId, userId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async updateBay(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();
      return successResponse(await workshopService.updateBay(id, body, tenantId, userId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async assignMechanic(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const { mechanicId, bayId, workOrderId } = await req.json();
      if (!mechanicId) throw new ValidationError('mechanicId is required');
      return createdResponse(await workshopService.assignMechanic(mechanicId, bayId, workOrderId, tenantId, userId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async releaseMechanic(req: NextRequest, assignmentId: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      return successResponse(await workshopService.releaseMechanic(assignmentId, tenantId, userId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  private handleError(error: unknown) {
    if (error instanceof AppError) return errorResponse(error.message, error.code, error.statusCode, error.details);
    console.error('[WorkshopController] Unexpected error:', error);
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

export const workshopController = new WorkshopController();