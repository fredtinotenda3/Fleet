// modules/procurement/controllers/procurement.controller.ts
import { NextRequest } from 'next/server';
import { procurementService } from '../services/procurement.service';
import { validatePaginationParams } from '@/shared/utils/pagination.utils';
import { successResponse, paginatedResponse, errorResponse, createdResponse } from '@/server/utils/response.utils';
import { AppError, ValidationError } from '@/server/errors/app.errors';
import { getTenantFromRequest, getUserIdFromRequest } from '@/server/utils/context.utils';

export class ProcurementController {
  async listRequests(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const sp = req.nextUrl.searchParams;
      const { page, limit } = validatePaginationParams(sp.get('page'), sp.get('limit'));
      const result = await procurementService.listRequests((sp.get('status') as any) || undefined, { page, limit }, tenantId);
      return paginatedResponse(result.data, result.pagination);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getRequest(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      return successResponse(await procurementService.getRequest(id, tenantId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async createRequest(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();
      return createdResponse(await procurementService.createRequest(body, tenantId, userId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async approveRequest(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      return successResponse(await procurementService.approveRequest(id, tenantId, userId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async rejectRequest(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const { reason } = await req.json();
      if (!reason) throw new ValidationError('reason is required');
      return successResponse(await procurementService.rejectRequest(id, reason, tenantId, userId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async listOrders(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const sp = req.nextUrl.searchParams;
      const { page, limit } = validatePaginationParams(sp.get('page'), sp.get('limit'));
      const result = await procurementService.listOrders(
        (sp.get('status') as any) || undefined,
        sp.get('vendorId') || undefined,
        { page, limit },
        tenantId
      );
      return paginatedResponse(result.data, result.pagination);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getOrder(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      return successResponse(await procurementService.getOrder(id, tenantId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async createOrder(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();
      return createdResponse(await procurementService.createOrder(body, tenantId, userId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async sendOrder(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      return successResponse(await procurementService.sendOrder(id, tenantId, userId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async receiveOrder(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();
      return successResponse(await procurementService.receiveOrder(id, body, tenantId, userId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async cancelOrder(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      return successResponse(await procurementService.cancelOrder(id, tenantId, userId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  private handleError(error: unknown) {
    if (error instanceof AppError) return errorResponse(error.message, error.code, error.statusCode, error.details);
    console.error('[ProcurementController] Unexpected error:', error);
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

export const procurementController = new ProcurementController();