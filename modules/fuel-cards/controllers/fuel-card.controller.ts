// modules/fuel-cards/controllers/fuel-card.controller.ts

import { NextRequest } from 'next/server';
import { fuelCardService } from '../services/fuel-card.service';
import { FuelCardFilters, FuelCardStatus } from '@/shared/types/fuel-card.types';
import { validatePaginationParams } from '@/shared/utils/pagination.utils';
import { successResponse, paginatedResponse, errorResponse, createdResponse } from '@/server/utils/response.utils';
import { AppError } from '@/server/errors/app.errors';
import { getTenantFromRequest, getUserIdFromRequest } from '@/server/utils/context.utils';

export class FuelCardController {
  async list(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const searchParams = req.nextUrl.searchParams;

      const filters: FuelCardFilters = {
        search: searchParams.get('search') || undefined,
        status: (searchParams.get('status') as FuelCardStatus) || undefined,
      };

      const pageParam = searchParams.get('page');
      if (!pageParam) {
        const result = await fuelCardService.list(filters, { page: 1, limit: 1000 }, tenantId);
        return successResponse(result.data);
      }

      const { page, limit } = validatePaginationParams(pageParam, searchParams.get('limit'));
      const result = await fuelCardService.list(filters, { page, limit }, tenantId);
      return paginatedResponse(result.data, result.pagination);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getById(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const card = await fuelCardService.getById(id, tenantId);
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
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();
      const card = await fuelCardService.update(id, body, tenantId, userId);
      return successResponse(card);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async remove(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const soft = req.nextUrl.searchParams.get('soft') !== 'false';
      await fuelCardService.remove(id, tenantId, userId, soft);
      return successResponse({ message: 'Fuel card deleted successfully' });
    } catch (error) {
      return this.handleError(error);
    }
  }

  private handleError(error: unknown) {
    if (error instanceof AppError) {
      return errorResponse(error.message, error.code, error.statusCode, error.details);
    }
    console.error('[FuelCardController] Unexpected error:', error);
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

export const fuelCardController = new FuelCardController();