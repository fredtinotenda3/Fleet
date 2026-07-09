// modules/fuel/controllers/fuel.controller.ts

import { NextRequest } from 'next/server';
import { bootstrapCqrs } from '@/server/cqrs/cqrs.module';
import { fuelCommandService } from '../services/fuel-command.service';
import { fuelQueryService } from '../services/fuel-query.service';
import { FuelFilters } from '@/shared/types/fuel.types';
import { validatePaginationParams } from '@/shared/utils/pagination.utils';
import {
  successResponse,
  paginatedResponse,
  errorResponse,
  createdResponse,
} from '@/server/utils/response.utils';
import { AppError, ValidationError } from '@/server/errors/app.errors';
import {
  getTenantFromRequest,
  getUserIdFromRequest,
} from '@/server/utils/context.utils';

bootstrapCqrs();

export class FuelController {
  async getFuelLogs(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const searchParams = req.nextUrl.searchParams;

      const filters: FuelFilters = {
        license_plate: searchParams.get('license_plate') || undefined,
        unit_id: searchParams.get('unit_id') || undefined,
        startDate: searchParams.get('start')
          ? new Date(searchParams.get('start')!)
          : undefined,
        endDate: searchParams.get('end')
          ? new Date(searchParams.get('end')!)
          : undefined,
      };

      const pageParam = searchParams.get('page');
      if (!pageParam) {
        const result = await fuelQueryService.getFilteredLogs(
          filters,
          { page: 1, limit: 10000 },
          tenantId
        );
        return successResponse(result.data);
      }

      const { page, limit } = validatePaginationParams(
        pageParam,
        searchParams.get('limit')
      );

      const result = await fuelQueryService.getFilteredLogs(
        filters,
        { page, limit },
        tenantId
      );

      return paginatedResponse(result.data, result.pagination);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getFuelLog(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const log = await fuelQueryService.getFuelLogById(id, tenantId);
      return successResponse(log);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async createFuelLog(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();

      const log = await fuelCommandService.createFuelLog(body, tenantId, userId);
      return createdResponse(log);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async updateFuelLog(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();

      const log = await fuelCommandService.updateFuelLog(id, body, tenantId, userId);
      return successResponse(log);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async deleteFuelLog(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const soft = req.nextUrl.searchParams.get('soft') !== 'false';

      await fuelCommandService.deleteFuelLog(id, tenantId, userId, soft);
      return successResponse({ message: 'Fuel log deleted successfully' });
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getFuelStats(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const searchParams = req.nextUrl.searchParams;

      const dateRange =
        searchParams.get('startDate') && searchParams.get('endDate')
          ? {
              startDate: new Date(searchParams.get('startDate')!),
              endDate: new Date(searchParams.get('endDate')!),
            }
          : undefined;

      const stats = await fuelQueryService.getFuelStats(tenantId, dateRange);
      return successResponse(stats);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getMonthlyConsumption(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const months = Number(req.nextUrl.searchParams.get('months') || '12');

      const data = await fuelQueryService.getMonthlyFuelConsumption(tenantId, months);
      return successResponse(data);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getTopConsumers(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const limit = Number(req.nextUrl.searchParams.get('limit') || '5');

      const data = await fuelQueryService.getTopFuelConsumers(tenantId, limit);
      return successResponse(data);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getFuelKpis(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const searchParams = req.nextUrl.searchParams;

      const dateRange =
        searchParams.get('startDate') && searchParams.get('endDate')
          ? {
              startDate: new Date(searchParams.get('startDate')!),
              endDate: new Date(searchParams.get('endDate')!),
            }
          : undefined;

      const kpis = await fuelQueryService.getFuelKpis(tenantId, dateRange);
      return successResponse(kpis);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getAbnormalConsumption(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const threshold = Number(req.nextUrl.searchParams.get('threshold') || '2');

      const data = await fuelQueryService.getAbnormalConsumption(tenantId, threshold);
      return successResponse(data);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private handleError(error: unknown) {
    if (error instanceof AppError) {
      return errorResponse(error.message, error.code, error.statusCode, error.details);
    }
    console.error('[FuelController] Unexpected error:', error);
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

export const fuelController = new FuelController();