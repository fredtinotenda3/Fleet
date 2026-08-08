// modules/fuel-cards/controllers/fuel-card.controller.ts

import { NextRequest } from 'next/server';
import { fuelCardService } from '../services/fuel-card.service';
import { FuelCardFilters, FuelCardStatus } from '@/shared/types/fuel-card.types';
import { validatePaginationParams } from '@/shared/utils/pagination.utils';
import { successResponse, paginatedResponse, errorResponse, createdResponse } from '@/server/utils/response.utils';
import { AppError, isAppError, describeError } from '@/server/errors/app.errors';
import { getTenantFromRequest, getUserIdFromRequest } from '@/server/utils/context.utils';
import { resolveTenantContext } from '@/server/utils/tenant-context.utils';

export class FuelCardController {
  async list(req: NextRequest) {
    try {
      const context = await resolveTenantContext(req);
      const searchParams = req.nextUrl.searchParams;

      const filters: FuelCardFilters = {
        search: searchParams.get('search') || undefined,
        status: (searchParams.get('status') as FuelCardStatus) || undefined,
      };

      const pageParam = searchParams.get('page');
      if (!pageParam) {
        // The unpaginated picker path. Scoped identically to the paged
        // path -- a picker that offers out-of-scope cards is the same
        // leak as a list that shows them, and is easier to miss.
        const result = await fuelCardService.listInScope(filters, { page: 1, limit: 1000 }, context);
        return successResponse(result.data);
      }

      const { page, limit } = validatePaginationParams(pageParam, searchParams.get('limit'));
      const result = await fuelCardService.listInScope(filters, { page, limit }, context);
      return paginatedResponse(result.data, result.pagination);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getById(req: NextRequest, id: string) {
    try {
      const context = await resolveTenantContext(req);
      const card = await fuelCardService.getByIdInScope(id, context);
      return successResponse(card);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async create(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();
      const card = await fuelCardService.create(body, tenantId, userId);
      return createdResponse(card);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async update(req: NextRequest, id: string) {
    try {
      const context = await resolveTenantContext(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();
      // Read gate before the write: refuse to edit a card the caller
      // cannot see, rather than letting the update's own tenant filter
      // (organization-wide) decide.
      await fuelCardService.getByIdInScope(id, context);
      const card = await fuelCardService.update(id, body, context.organizationId, userId);
      return successResponse(card);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async remove(req: NextRequest, id: string) {
    try {
      const context = await resolveTenantContext(req);
      const userId = await getUserIdFromRequest(req);
      const soft = req.nextUrl.searchParams.get('soft') !== 'false';
      await fuelCardService.getByIdInScope(id, context);
      await fuelCardService.remove(id, context.organizationId, userId, soft);
      return successResponse({ message: 'Fuel card deleted successfully' });
    } catch (error) {
      return this.handleError(error);
    }
  }

  private handleError(error: unknown) {
    if (isAppError(error)) {
      return errorResponse(error.message, error.code, error.statusCode, error.details);
    }
    console.error('[FuelCardController] Unexpected error:', describeError(error));
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

export const fuelCardController = new FuelCardController();