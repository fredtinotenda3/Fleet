// modules/procurement/controllers/procurement.controller.ts
import { NextRequest } from 'next/server';
import { procurementService } from '../services/procurement.service';
import { validatePaginationParams } from '@/shared/utils/pagination.utils';
import { successResponse, paginatedResponse, errorResponse, createdResponse } from '@/server/utils/response.utils';
import { AppError, ValidationError } from '@/server/errors/app.errors';
import { getTenantFromRequest, getUserIdFromRequest } from '@/server/utils/context.utils';
import { resolveTenantContext } from '@/server/utils/tenant-context.utils';

export class ProcurementController {
  async listRequests(req: NextRequest) {
    try {
      const context = await resolveTenantContext(req);
      const sp = req.nextUrl.searchParams;
      const { page, limit } = validatePaginationParams(sp.get('page'), sp.get('limit'));
      const result = await procurementService.listRequestsInScope((sp.get('status') as any) || undefined, { page, limit }, context);
      return paginatedResponse(result.data, result.pagination);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getRequest(req: NextRequest, id: string) {
    try {
      const context = await resolveTenantContext(req);
      return successResponse(await procurementService.getRequestInScope(id, context));
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
      /**
       * SEGREGATION OF DUTIES, not merely visibility.
       *
       * BRANCH_MANAGER holds Permission.PROCUREMENT_APPROVE, and this
       * endpoint previously resolved the request by id within the TENANT
       * -- which is the whole organization. Any branch manager could
       * therefore approve any other branch's spend, and the permission
       * check would pass because they do legitimately hold the approve
       * permission; what they lacked was authority over THIS request.
       *
       * getRequestInScope() supplies the missing half.
       */
      const context = await resolveTenantContext(req);
      const userId = await getUserIdFromRequest(req);
      await procurementService.getRequestInScope(id, context);
      return successResponse(await procurementService.approveRequest(id, context.organizationId, userId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async rejectRequest(req: NextRequest, id: string) {
    try {
      // Same authority gate as approveRequest -- rejecting another
      // branch's request is equally a cross-unit write.
      const context = await resolveTenantContext(req);
      const userId = await getUserIdFromRequest(req);
      const { reason } = await req.json();
      if (!reason) throw new ValidationError('reason is required');
      await procurementService.getRequestInScope(id, context);
      return successResponse(await procurementService.rejectRequest(id, reason, context.organizationId, userId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async listOrders(req: NextRequest) {
    try {
      const context = await resolveTenantContext(req);
      const sp = req.nextUrl.searchParams;
      const { page, limit } = validatePaginationParams(sp.get('page'), sp.get('limit'));
      const result = await procurementService.listOrdersInScope(
        (sp.get('status') as any) || undefined,
        sp.get('vendorId') || undefined,
        { page, limit },
        context
      );
      return paginatedResponse(result.data, result.pagination);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getOrder(req: NextRequest, id: string) {
    try {
      const context = await resolveTenantContext(req);
      return successResponse(await procurementService.getOrderInScope(id, context));
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
      const context = await resolveTenantContext(req);
      const userId = await getUserIdFromRequest(req);
      await procurementService.getOrderInScope(id, context);
      return successResponse(await procurementService.sendOrder(id, context.organizationId, userId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async receiveOrder(req: NextRequest, id: string) {
    try {
      const context = await resolveTenantContext(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();
      await procurementService.getOrderInScope(id, context);
      return successResponse(await procurementService.receiveOrder(id, body, context.organizationId, userId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async cancelOrder(req: NextRequest, id: string) {
    try {
      const context = await resolveTenantContext(req);
      const userId = await getUserIdFromRequest(req);
      await procurementService.getOrderInScope(id, context);
      return successResponse(await procurementService.cancelOrder(id, context.organizationId, userId));
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