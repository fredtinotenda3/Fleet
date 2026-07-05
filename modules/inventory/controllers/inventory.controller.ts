// modules/inventory/controllers/inventory.controller.ts
import { NextRequest } from 'next/server';
import { inventoryService } from '../services/inventory.service';
import { SparePartFilters } from '../types/inventory.types';
import { validatePaginationParams } from '@/shared/utils/pagination.utils';
import { successResponse, paginatedResponse, errorResponse, createdResponse } from '@/server/utils/response.utils';
import { AppError, ValidationError } from '@/server/errors/app.errors';
import { getTenantFromRequest, getUserIdFromRequest } from '@/server/utils/context.utils';

export class InventoryController {
  async listParts(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const sp = req.nextUrl.searchParams;
      const filters: SparePartFilters = {
        category: sp.get('category') || undefined,
        belowReorderThreshold: sp.get('belowReorderThreshold') === 'true',
        search: sp.get('search') || undefined,
      };
      const { page, limit } = validatePaginationParams(sp.get('page'), sp.get('limit'));
      const result = await inventoryService.listParts(filters, { page, limit }, tenantId);
      return paginatedResponse(result.data, result.pagination);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getPart(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      return successResponse(await inventoryService.getPart(id, tenantId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async createPart(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();
      return createdResponse(await inventoryService.createPart(body, tenantId, userId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async updatePart(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();
      return successResponse(await inventoryService.updatePart(id, body, tenantId, userId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async receiveStock(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const { quantity } = await req.json();
      if (typeof quantity !== 'number') throw new ValidationError('quantity (number) is required');
      return successResponse(await inventoryService.receiveStock(id, quantity, tenantId, userId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async consumeStock(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const { quantity, workOrderId } = await req.json();
      if (typeof quantity !== 'number') throw new ValidationError('quantity (number) is required');
      return successResponse(await inventoryService.consumeStock(id, quantity, tenantId, userId, { workOrderId }));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async adjustStock(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const { delta, reason } = await req.json();
      if (typeof delta !== 'number') throw new ValidationError('delta (number) is required');
      return successResponse(await inventoryService.adjustStock(id, delta, reason || 'Manual adjustment', tenantId, userId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async listMovements(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const sp = req.nextUrl.searchParams;
      const { page, limit } = validatePaginationParams(sp.get('page'), sp.get('limit'));
      const result = await inventoryService.listMovements(id, { page, limit }, tenantId);
      return paginatedResponse(result.data, result.pagination);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private handleError(error: unknown) {
    if (error instanceof AppError) return errorResponse(error.message, error.code, error.statusCode, error.details);
    console.error('[InventoryController] Unexpected error:', error);
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

export const inventoryController = new InventoryController();