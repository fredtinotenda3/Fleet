// frontend/modules/trips/services/trips.api.ts

import { apiClient } from '@/shared/utils/api-client.utils';
import type { PaginatedResponse } from '@/shared/types/common.types';
import type { ExportFormat } from '@/shared/export/export.types';
import type { ExportBlobResponse } from '@/shared/utils/export-download.utils';
import type {
  Trip,
  TripStats,
  TripTableFilters,
  TripKpis,
  TripExceptionRow,
  TripMonthlyTrendPoint,
  VehicleUtilizationRow,
  DriverUtilizationRow,
  TripDistanceDistributionBucket,
  TripHeatmapCell,
  TripUtilizationSort,
} from '../types';
import type { TripFormOutput } from '../schemas';

const BASE = '/api/trips';

export interface TripListParams extends TripTableFilters {
  page?: number;
  limit?: number;
}

function toIso(value: Date | string | undefined): string | undefined {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString() : value;
}

function buildListQuery(params: Partial<TripListParams>) {
  return {
    license_plate: params.license_plate,
    mode: params.mode,
    driver_id: params.driver_id,
    status: params.status,
    trip_type: params.trip_type,
    routeId: params.routeId,
    start: toIso(params.startDate),
    end: toIso(params.endDate),
    page: params.page,
    limit: params.limit,
  };
}

/**
 * VEHICLE-SCOPE ADDITION: optional `licensePlate` third argument.
 * When provided it's added to the query as `license_plate`, the same
 * param name used by the list endpoint -- backend controller resolves
 * it via parseLicensePlate() for every analytics route below.
 */
function buildRangeQuery(
  dateRange?: { startDate?: Date; endDate?: Date },
  licensePlate?: string
) {
  const params: Record<string, string | undefined> = {};
  if (dateRange?.startDate) params.startDate = dateRange.startDate.toISOString();
  if (dateRange?.endDate) params.endDate = dateRange.endDate.toISOString();
  if (licensePlate) params.license_plate = licensePlate;
  return params;
}

export const tripsApi = {
  async list(params: Partial<TripListParams>): Promise<PaginatedResponse<Trip>> {
    return apiClient.get<PaginatedResponse<Trip>>(BASE, { params: buildListQuery(params) });
  },

  async getById(id: string): Promise<Trip> {
    return apiClient.get<Trip>(`${BASE}/${id}`);
  },

  async getStats(dateRange?: { startDate?: Date; endDate?: Date }): Promise<TripStats> {
    return apiClient.get<TripStats>(`${BASE}/stats`, { params: buildRangeQuery(dateRange) });
  },

  /** PHASE 1. VEHICLE-SCOPE ADDITION: optional licensePlate. */
  async getKpis(
    dateRange?: { startDate?: Date; endDate?: Date },
    licensePlate?: string
  ): Promise<TripKpis> {
    return apiClient.get<TripKpis>(`${BASE}/kpis`, { params: buildRangeQuery(dateRange, licensePlate) });
  },

  /** PHASE 1. VEHICLE-SCOPE ADDITION: optional licensePlate. */
  async getExceptions(
    dateRange?: { startDate?: Date; endDate?: Date },
    zThreshold: number = 2.5,
    limit: number = 50,
    licensePlate?: string
  ): Promise<TripExceptionRow[]> {
    const params: Record<string, string | number | undefined> = {
      ...buildRangeQuery(dateRange, licensePlate),
      zThreshold,
      limit,
    };
    return apiClient.get<TripExceptionRow[]>(`${BASE}/exceptions`, { params });
  },

  /** PHASE 2: Monthly Trip Trend. VEHICLE-SCOPE ADDITION: optional licensePlate. */
  async getMonthlyTrend(months: number = 12, licensePlate?: string): Promise<TripMonthlyTrendPoint[]> {
    return apiClient.get<TripMonthlyTrendPoint[]>(`${BASE}/monthly-trend`, {
      params: { months, license_plate: licensePlate },
    });
  },

  /** PHASE 2: Vehicle Utilization ranking (fleet-wide; no vehicle scope by design). */
  async getVehicleUtilization(
    dateRange?: { startDate?: Date; endDate?: Date },
    limit: number = 20,
    sortBy: TripUtilizationSort = 'trips'
  ): Promise<VehicleUtilizationRow[]> {
    const params: Record<string, string | number | undefined> = {
      ...buildRangeQuery(dateRange),
      limit,
      sortBy,
    };
    return apiClient.get<VehicleUtilizationRow[]>(`${BASE}/vehicle-utilization`, { params });
  },

  /** PHASE 2: Driver Utilization ranking. VEHICLE-SCOPE ADDITION: optional licensePlate. */
  async getDriverUtilization(
    dateRange?: { startDate?: Date; endDate?: Date },
    limit: number = 20,
    sortBy: TripUtilizationSort = 'trips',
    licensePlate?: string
  ): Promise<DriverUtilizationRow[]> {
    const params: Record<string, string | number | undefined> = {
      ...buildRangeQuery(dateRange, licensePlate),
      limit,
      sortBy,
    };
    return apiClient.get<DriverUtilizationRow[]>(`${BASE}/driver-utilization`, { params });
  },

  /** PHASE 2: Distance Distribution histogram. VEHICLE-SCOPE ADDITION: optional licensePlate. */
  async getDistanceDistribution(
    dateRange?: { startDate?: Date; endDate?: Date },
    licensePlate?: string
  ): Promise<TripDistanceDistributionBucket[]> {
    return apiClient.get<TripDistanceDistributionBucket[]>(`${BASE}/distance-distribution`, {
      params: buildRangeQuery(dateRange, licensePlate),
    });
  },

  /** PHASE 2: Day-of-week x hour heatmap. VEHICLE-SCOPE ADDITION: optional licensePlate. */
  async getDayOfWeekHeatmap(
    dateRange?: { startDate?: Date; endDate?: Date },
    licensePlate?: string
  ): Promise<TripHeatmapCell[]> {
    return apiClient.get<TripHeatmapCell[]>(`${BASE}/day-of-week`, {
      params: buildRangeQuery(dateRange, licensePlate),
    });
  },

  async create(payload: TripFormOutput): Promise<Trip> {
    return apiClient.post<Trip>(BASE, payload);
  },

  async update(id: string, payload: Partial<TripFormOutput>): Promise<Trip> {
    return apiClient.put<Trip>(`${BASE}/${id}`, payload);
  },

  async remove(id: string): Promise<{ message: string }> {
    return apiClient.delete<{ message: string }>(`${BASE}/${id}`);
  },

  /**
   * Enterprise Export Framework (Phase 2). Hits GET /api/trips/export
   * with the same filter fields as list(), so the backend re-queries the
   * full authorized, filtered result set (capped at EXPORT_ROW_CAP)
   * rather than exporting only the currently-loaded page.
   */
  async exportFile(filters: Partial<TripTableFilters>, format: ExportFormat = 'csv'): Promise<ExportBlobResponse> {
    return apiClient.getBlob(`${BASE}/export`, {
      params: {
        license_plate: filters.license_plate,
        mode: filters.mode,
        driver_id: filters.driver_id,
        status: filters.status,
        trip_type: filters.trip_type,
        routeId: filters.routeId,
        start: toIso(filters.startDate),
        end: toIso(filters.endDate),
        format,
      },
    });
  },
};