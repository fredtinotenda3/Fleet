// modules/vendors/controllers/vendor.controller.ts
import { NextRequest } from 'next/server';
import { vendorService } from '../services/vendor.service';
import { VendorFilters } from '../types/vendor.types';
import { validatePaginationParams } from '@/shared/utils/pagination.utils';
import { successResponse, paginatedResponse, errorResponse, createdResponse } from '@/server/utils/response.utils';
import { AppError, ValidationError } from '@/server/errors/app.errors';
import { getTenantFromRequest, getUserIdFromRequest } from '@/server/utils/context.utils';

export class VendorController {
  async list(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const sp = req.nextUrl.searchParams;
      const filters: VendorFilters = {
        category: (sp.get('category') as any) || undefined,
        status: (sp.get('status') as any) || undefined,
        search: sp.get('search') || undefined,
      };
      const { page, limit } = validatePaginationParams(sp.get('page'), sp.get('limit'));
      const result = await vendorService.list(filters, { page, limit }, tenantId);
      return paginatedResponse(result.data, result.pagination);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async get(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      return successResponse(await vendorService.getById(id, tenantId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async create(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();
      return createdResponse(await vendorService.create(body, tenantId, userId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async update(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();
      return successResponse(await vendorService.update(id, body, tenantId, userId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async rate(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const { rating } = await req.json();
      if (typeof rating !== 'number') throw new ValidationError('rating (number) is required');
      return successResponse(await vendorService.rate(id, rating, tenantId, userId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async delete(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      await vendorService.delete(id, tenantId, userId);
      return successResponse({ message: 'Vendor deleted' });
    } catch (error) {
      return this.handleError(error);
    }
  }

  private handleError(error: unknown) {
    if (error instanceof AppError) return errorResponse(error.message, error.code, error.statusCode, error.details);
    console.error('[VendorController] Unexpected error:', error);
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

export const vendorController = new VendorController();