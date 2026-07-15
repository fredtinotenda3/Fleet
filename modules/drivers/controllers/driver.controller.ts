// modules/drivers/controllers/driver.controller.ts

import { NextRequest } from 'next/server';
import { driverService } from '../services/driver.service';
import { DriverFilters, DriverStatus } from '@/shared/types/driver.types';
import { validatePaginationParams } from '@/shared/utils/pagination.utils';
import {
  successResponse,
  paginatedResponse,
  errorResponse,
  createdResponse,
} from '@/server/utils/response.utils';
import { AppError } from '@/server/errors/app.errors';
import { getTenantFromRequest, getUserIdFromRequest } from '@/server/utils/context.utils';

export class DriverController {
  async list(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const searchParams = req.nextUrl.searchParams;

      const filters: DriverFilters = {
        search: searchParams.get('search') || undefined,
        status: (searchParams.get('status') as DriverStatus) || undefined,
      };

      const pageParam = searchParams.get('page');
      if (!pageParam) {
        // Matches FuelStationController/FuelCardController: no `page`
        // param -> return a bare array for pickers (DriverSelect,
        // FuelForm, FuelFilters) that just want the full roster.
        const result = await driverService.list(filters, { page: 1, limit: 1000 }, tenantId);
        return successResponse(result.data);
      }

      const { page, limit } = validatePaginationParams(pageParam, searchParams.get('limit'));
      const result = await driverService.list(filters, { page, limit }, tenantId);
      return paginatedResponse(result.data, result.pagination);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getById(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const driver = await driverService.getById(id, tenantId);
      return successResponse(driver);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async create(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();
      const driver = await driverService.create(body, tenantId, userId);
      return createdResponse(driver);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async update(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();
      const driver = await driverService.update(id, body, tenantId, userId);
      return successResponse(driver);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async remove(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const soft = req.nextUrl.searchParams.get('soft') !== 'false';
      await driverService.remove(id, tenantId, userId, soft);
      return successResponse({ message: 'Driver deleted successfully' });
    } catch (error) {
      return this.handleError(error);
    }
  }

  private handleError(error: unknown) {
    if (error instanceof AppError) {
      return errorResponse(error.message, error.code, error.statusCode, error.details);
    }
    console.error('[DriverController] Unexpected error:', error);
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

export const driverController = new DriverController();