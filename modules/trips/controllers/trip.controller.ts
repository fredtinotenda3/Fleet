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
import { AppError, ValidationError, UnauthorizedError, ForbiddenError, NotFoundError } from '@/server/errors/app.errors';
import {
  getTenantFromRequest,
  getUserIdFromRequest,
} from '@/server/utils/context.utils';
import { getAuthContext } from '@/server/auth/auth-context';
import { tenantContextService } from '@/modules/tenancy/services/tenant-context.service';
import { tenantScopeService } from '@/modules/tenancy/services/tenant-scope.service';
import { tripRepository } from '../repositories/trip.repository';
import { exportService, fileDownloadResponse } from '@/shared/export';
import {
  TRIP_EXPORT_COLUMNS,
  TRIP_EXPORT_SHEET_NAME,
  TRIP_EXPORT_BASE_FILENAME,
} from '../export/trip-export.columns';

bootstrapCqrs();

/**
 * PHASE 1: shared filter parsing, extended with status/trip_type/routeId.
 * Previously duplicated between getTrips and exportTrips; pulled into
 * one helper so the two new fields only need to be added in one place.
 */
function parseTripFilters(searchParams: URLSearchParams): TripFilters {
  return {
    license_plate: searchParams.get('license_plate') || undefined,
    mode: (searchParams.get('mode') as any) || undefined,
    driver_id: searchParams.get('driver_id') || undefined,
    status: (searchParams.get('status') as any) || undefined,
    trip_type: (searchParams.get('trip_type') as any) || undefined,
    routeId: searchParams.get('routeId') || undefined,
    startDate: searchParams.get('start')
      ? new Date(searchParams.get('start')!)
      : undefined,
    endDate: searchParams.get('end')
      ? new Date(searchParams.get('end')!)
      : undefined,
  };
}

/**
 * VEHICLE-SCOPE ADDITION: shared license_plate parsing for the
 * analytics endpoints below, mirroring the same `?license_plate=`
 * query param already used across Fuel and Expense analytics. Returns
 * undefined (fleet-wide) when the param is absent, uppercased when
 * present to match how license_plate is always stored.
 */
function parseLicensePlate(searchParams: URLSearchParams): string | undefined {
  const value = searchParams.get('license_plate');
  return value ? value.toUpperCase() : undefined;
}

export class TripController {
  async getTrips(req: NextRequest) {
    try {
      const authContext = await getAuthContext(req);
      if (!authContext) {
        throw new UnauthorizedError('Authentication required');
      }

      const tenantContext = await tenantContextService.resolveContext(
        authContext.userId,
        authContext.tenantId,
        authContext.roles,
        authContext.isSuperAdmin,
        authContext.orgUnitId
      );

      const searchParams = req.nextUrl.searchParams;
      const filters = parseTripFilters(searchParams);

      // Support non-paginated path for legacy dashboard/chart usage
      const pageParam = searchParams.get('page');
      if (!pageParam) {
        const result = await tripRepository.getFilteredTripsInScope(
          filters,
          tenantContext,
          { page: 1, limit: 10000 }
        );
        return successResponse(result.data);
      }

      const { page, limit } = validatePaginationParams(
        pageParam,
        searchParams.get('limit')
      );

      const result = await tripRepository.getFilteredTripsInScope(
        filters,
        tenantContext,
        { page, limit }
      );

      return paginatedResponse(result.data, result.pagination);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Phase 2 Enterprise Export Framework: exports the COMPLETE set of
   * trips matching the caller's current filters and authorization
   * scope, not just the page of results currently loaded in the UI
   * table. Reuses the exact same auth/tenant-context/filter parsing as
   * getTrips above.
   */
  async exportTrips(req: NextRequest) {
    try {
      const authContext = await getAuthContext(req);
      if (!authContext) {
        throw new UnauthorizedError('Authentication required');
      }

      const tenantContext = await tenantContextService.resolveContext(
        authContext.userId,
        authContext.tenantId,
        authContext.roles,
        authContext.isSuperAdmin,
        authContext.orgUnitId
      );

      const searchParams = req.nextUrl.searchParams;
      const filters = parseTripFilters(searchParams);
      const format = exportService.parseFormat(searchParams.get('format'));

      const { rows, totalMatched, truncated, exportCap } = await tripRepository.getFilteredTripsForExport(
        filters,
        tenantContext
      );

      const file = exportService.generate(
        rows,
        TRIP_EXPORT_COLUMNS,
        format,
        TRIP_EXPORT_BASE_FILENAME,
        TRIP_EXPORT_SHEET_NAME
      );

      return fileDownloadResponse(file, {
        totalMatched,
        rowsExported: rows.length,
        truncated,
        exportCap,
      });
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * FIX (critical -- org-unit scope bypass on single-record access):
   * same bug/fix as VehicleController.loadInScopeVehicle. getTrips (the
   * list endpoint) is the only place that used to apply org-unit
   * scoping; getTrip/updateTrip/deleteTrip checked only tenantId, so a
   * user scoped to a single branch could still read/edit/delete any
   * trip in the tenant by ID. This re-resolves the caller's
   * TenantContext and verifies the target trip's orgUnitId is one the
   * caller may access, throwing NotFoundError (not ForbiddenError) on a
   * scope violation to avoid leaking the existence of out-of-scope
   * records.
   */
  private async loadInScopeTrip(req: NextRequest, id: string) {
    const authContext = await getAuthContext(req);
    if (!authContext) {
      throw new UnauthorizedError('Authentication required');
    }

    const trip = await tripQueryService.getTripById(id, authContext.tenantId);

    const tenantContext = await tenantContextService.resolveContext(
      authContext.userId,
      authContext.tenantId,
      authContext.roles,
      authContext.isSuperAdmin,
      authContext.orgUnitId
    );

    const tripOrgUnitId = (trip as any).orgUnitId as string | undefined;
    if (
      tripOrgUnitId &&
      !tenantScopeService.canAccessOrgUnit(tenantContext, tripOrgUnitId)
    ) {
      throw new NotFoundError('Trip not found');
    }

    return { authContext, trip };
  }

  async getTrip(req: NextRequest, id: string) {
    try {
      const { trip } = await this.loadInScopeTrip(req, id);
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
      const { authContext } = await this.loadInScopeTrip(req, id);
      const userId = authContext.userId;
      const body = await req.json();

      const trip = await tripCommandService.updateTrip(id, body, authContext.tenantId, userId);
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
      const { authContext } = await this.loadInScopeTrip(req, id);
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

  /**
   * PHASE 1: executive KPI cards endpoint, backing GET /api/trips/kpis
   * VEHICLE-SCOPE ADDITION: honors ?license_plate= to scope KPIs to a
   * single vehicle -- same param used across Fuel/Expense analytics.
   */
  async getTripKpis(req: NextRequest) {
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
      const licensePlate = parseLicensePlate(searchParams);

      const kpis = await tripQueryService.getTripKpis(tenantId, dateRange, licensePlate);
      return successResponse(kpis);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * PHASE 1: exception analytics endpoint, backing GET /api/trips/exceptions
   * VEHICLE-SCOPE ADDITION: honors ?license_plate=.
   */
  async getTripExceptions(req: NextRequest) {
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
      const zThreshold = Number(searchParams.get('zThreshold') || '2.5');
      const limit = Number(searchParams.get('limit') || '50');
      const licensePlate = parseLicensePlate(searchParams);

      const exceptions = await tripQueryService.getTripExceptions(tenantId, dateRange, zThreshold, limit, licensePlate);
      return successResponse(exceptions);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /** Shared dateRange parsing for the Phase 2 analytics endpoints below. */
  private parseDateRange(req: NextRequest): { startDate?: Date; endDate?: Date } | undefined {
    const searchParams = req.nextUrl.searchParams;
    return searchParams.get('startDate') && searchParams.get('endDate')
      ? {
          startDate: new Date(searchParams.get('startDate')!),
          endDate: new Date(searchParams.get('endDate')!),
        }
      : undefined;
  }

  /**
   * PHASE 2: monthly trip trend, backing GET /api/trips/monthly-trend
   * VEHICLE-SCOPE ADDITION: honors ?license_plate=.
   */
  async getMonthlyTripTrend(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const months = Number(req.nextUrl.searchParams.get('months') || '12');
      const licensePlate = parseLicensePlate(req.nextUrl.searchParams);

      const data = await tripQueryService.getMonthlyTripTrend(tenantId, months, licensePlate);
      return successResponse(data);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * PHASE 2: vehicle utilization, backing GET /api/trips/vehicle-utilization
   * (fleet-wide ranking; intentionally not vehicle-scoped -- see
   * TripQueryService.getVehicleUtilization for rationale).
   */
  async getVehicleUtilization(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const searchParams = req.nextUrl.searchParams;
      const dateRange = this.parseDateRange(req);
      const limit = Number(searchParams.get('limit') || '20');
      const sortBy = (searchParams.get('sortBy') as 'trips' | 'distance') || 'trips';

      const data = await tripQueryService.getVehicleUtilization(tenantId, dateRange, limit, sortBy);
      return successResponse(data);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * PHASE 2: driver utilization, backing GET /api/trips/driver-utilization
   * VEHICLE-SCOPE ADDITION: honors ?license_plate=.
   */
  async getDriverUtilization(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const searchParams = req.nextUrl.searchParams;
      const dateRange = this.parseDateRange(req);
      const limit = Number(searchParams.get('limit') || '20');
      const sortBy = (searchParams.get('sortBy') as 'trips' | 'distance') || 'trips';
      const licensePlate = parseLicensePlate(searchParams);

      const data = await tripQueryService.getDriverUtilization(tenantId, dateRange, limit, sortBy, licensePlate);
      return successResponse(data);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * PHASE 2: distance distribution histogram, backing GET /api/trips/distance-distribution
   * VEHICLE-SCOPE ADDITION: honors ?license_plate=.
   */
  async getTripDistanceDistribution(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const dateRange = this.parseDateRange(req);
      const licensePlate = parseLicensePlate(req.nextUrl.searchParams);

      const data = await tripQueryService.getTripDistanceDistribution(tenantId, dateRange, licensePlate);
      return successResponse(data);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * PHASE 2: day-of-week x hour heatmap, backing GET /api/trips/day-of-week
   * VEHICLE-SCOPE ADDITION: honors ?license_plate=.
   */
  async getTripsByDayOfWeek(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const dateRange = this.parseDateRange(req);
      const licensePlate = parseLicensePlate(req.nextUrl.searchParams);

      const data = await tripQueryService.getTripsByDayOfWeek(tenantId, dateRange, licensePlate);
      return successResponse(data);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * PHASE 3: cross-module cost analytics rows, backing GET /api/trips/cost-analytics
   * VEHICLE-SCOPE ADDITION: honors ?license_plate=.
   */
  async getTripCostAnalytics(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const dateRange = this.parseDateRange(req);
      const limit = Number(req.nextUrl.searchParams.get('limit') || '100');
      const licensePlate = parseLicensePlate(req.nextUrl.searchParams);

      const data = await tripQueryService.getTripCostAnalytics(tenantId, dateRange, limit, licensePlate);
      return successResponse(data);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * PHASE 3: fleet-wide cost summary, backing GET /api/trips/cost-summary
   * VEHICLE-SCOPE ADDITION: honors ?license_plate=.
   */
  async getTripCostSummary(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const dateRange = this.parseDateRange(req);
      const licensePlate = parseLicensePlate(req.nextUrl.searchParams);

      const data = await tripQueryService.getTripCostSummary(tenantId, dateRange, licensePlate);
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