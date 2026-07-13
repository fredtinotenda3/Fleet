// modules/trips/controllers/trip.controller.ts

import { NextRequest } from 'next/server';
import { bootstrapCqrs } from '@/server/cqrs/cqrs.module';
import { tripCommandService } from '../services/trip-command.service';
import { tripQueryService } from '../services/trip-query.service';
import { TripFilters } from '@/shared/types/trip.types';
import { validatePaginationParams } from '@/shared/utils/pagination.utils';
import {
  successResponse,
  paginatedResponse,
  errorResponse,
  createdResponse,
} from '@/server/utils/response.utils';
import { AppError, ValidationError, UnauthorizedError, ForbiddenError } from '@/server/errors/app.errors';
import {
  getTenantFromRequest,
  getUserIdFromRequest,
} from '@/server/utils/context.utils';
import { getAuthContext } from '@/server/auth/auth-context';

bootstrapCqrs();

export class TripController {
  async getTrips(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const searchParams = req.nextUrl.searchParams;

      const filters: TripFilters = {
        license_plate: searchParams.get('license_plate') || undefined,
        mode: (searchParams.get('mode') as any) || undefined,
        driver_id: searchParams.get('driver_id') || undefined,
        startDate: searchParams.get('start')
          ? new Date(searchParams.get('start')!)
          : undefined,
        endDate: searchParams.get('end')
          ? new Date(searchParams.get('end')!)
          : undefined,
      };

      // Support non-paginated path for legacy dashboard/chart usage
      const pageParam = searchParams.get('page');
      if (!pageParam) {
        const result = await tripQueryService.getFilteredTrips(
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

      const result = await tripQueryService.getFilteredTrips(
        filters,
        { page, limit },
        tenantId
      );

      return paginatedResponse(result.data, result.pagination);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getTrip(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const trip = await tripQueryService.getTripById(id, tenantId);
      return successResponse(trip);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async createTrip(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();

      const trip = await tripCommandService.createTrip(body, tenantId, userId);
      return createdResponse(trip);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async updateTrip(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();

      const trip = await tripCommandService.updateTrip(id, body, tenantId, userId);
      return successResponse(trip);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * FIX (critical -- unauthorized hard delete): same bug/fix as
   * VehicleController.deleteVehicle. `?soft=false` used to permanently
   * hardDelete() a trip under the same TRIP_DELETE permission as an
   * ordinary soft delete.
   */
  async deleteTrip(req: NextRequest, id: string) {
    try {
      const authContext = await getAuthContext(req);
      if (!authContext) {
        throw new UnauthorizedError('Authentication required');
      }
      const soft = req.nextUrl.searchParams.get('soft') !== 'false';

      if (!soft && !authContext.isSuperAdmin) {
        throw new ForbiddenError(
          'Permanently deleting a trip requires organization owner or super admin access. Use a soft delete instead.'
        );
      }

      await tripCommandService.deleteTrip(id, authContext.tenantId, authContext.userId, soft);
      return successResponse({ message: 'Trip deleted successfully' });
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getTripStats(req: NextRequest) {
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

      const stats = await tripQueryService.getTripStats(tenantId, dateRange);
      return successResponse(stats);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getDailyDistance(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const days = Number(req.nextUrl.searchParams.get('days') || '30');

      const data = await tripQueryService.getDailyDistance(tenantId, days);
      return successResponse(data);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private handleError(error: unknown) {
    if (error instanceof AppError) {
      return errorResponse(error.message, error.code, error.statusCode, error.details);
    }
    console.error('[TripController] Unexpected error:', error);
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

export const tripController = new TripController();