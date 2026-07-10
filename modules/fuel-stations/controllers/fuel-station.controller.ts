// modules/fuel-stations/controllers/fuel-station.controller.ts

import { NextRequest } from 'next/server';
import { fuelStationService } from '../services/fuel-station.service';
import { FuelStationFilters } from '@/shared/types/fuel-station.types';
import { validatePaginationParams } from '@/shared/utils/pagination.utils';
import { successResponse, paginatedResponse, errorResponse, createdResponse } from '@/server/utils/response.utils';
import { AppError } from '@/server/errors/app.errors';
import { getTenantFromRequest, getUserIdFromRequest } from '@/server/utils/context.utils';

export class FuelStationController {
  async list(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const searchParams = req.nextUrl.searchParams;

      const filters: FuelStationFilters = {
        search: searchParams.get('search') || undefined,
        isActive: searchParams.has('isActive') ? searchParams.get('isActive') === 'true' : undefined,
      };

      const pageParam = searchParams.get('page');
      if (!pageParam) {
        const result = await fuelStationService.list(filters, { page: 1, limit: 1000 }, tenantId);
        return successResponse(result.data);
      }

      const { page, limit } = validatePaginationParams(pageParam, searchParams.get('limit'));
      const result = await fuelStationService.list(filters, { page, limit }, tenantId);
      return paginatedResponse(result.data, result.pagination);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getById(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const station = await fuelStationService.getById(id, tenantId);
      return successResponse(station);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async create(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();
      const station = await fuelStationService.create(body, tenantId, userId);
      return createdResponse(station);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async update(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();
      const station = await fuelStationService.update(id, body, tenantId, userId);
      return successResponse(station);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async remove(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const soft = req.nextUrl.searchParams.get('soft') !== 'false';
      await fuelStationService.remove(id, tenantId, userId, soft);
      return successResponse({ message: 'Fuel station deleted successfully' });
    } catch (error) {
      return this.handleError(error);
    }
  }

  private handleError(error: unknown) {
    if (error instanceof AppError) {
      return errorResponse(error.message, error.code, error.statusCode, error.details);
    }
    console.error('[FuelStationController] Unexpected error:', error);
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

export const fuelStationController = new FuelStationController();