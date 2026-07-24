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

function buildRangeQuery(dateRange?: { startDate?: Date; endDate?: Date }) {
  const params: Record<string, string | undefined> = {};
  if (dateRange?.startDate) params.startDate = dateRange.startDate.toISOString();
  if (dateRange?.endDate) params.endDate = dateRange.endDate.toISOString();
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

  /** PHASE 1 */
  async getKpis(dateRange?: { startDate?: Date; endDate?: Date }): Promise<TripKpis> {
    return apiClient.get<TripKpis>(`${BASE}/kpis`, { params: buildRangeQuery(dateRange) });
  },

  /** PHASE 1 */
  async getExceptions(
    dateRange?: { startDate?: Date; endDate?: Date },
    zThreshold: number = 2.5,
    limit: number = 50
  ): Promise<TripExceptionRow[]> {
    const params: Record<string, string | number | undefined> = {
      ...buildRangeQuery(dateRange),
      zThreshold,
      limit,
    };
    return apiClient.get<TripExceptionRow[]>(`${BASE}/exceptions`, { params });
  },

  /** PHASE 2: Monthly Trip Trend */
  async getMonthlyTrend(months: number = 12): Promise<TripMonthlyTrendPoint[]> {
    return apiClient.get<TripMonthlyTrendPoint[]>(`${BASE}/monthly-trend`, { params: { months } });
  },

  /** PHASE 2: Vehicle Utilization ranking */
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

  /** PHASE 2: Driver Utilization ranking */
  async getDriverUtilization(
    dateRange?: { startDate?: Date; endDate?: Date },
    limit: number = 20,
    sortBy: TripUtilizationSort = 'trips'
  ): Promise<DriverUtilizationRow[]> {
    const params: Record<string, string | number | undefined> = {
      ...buildRangeQuery(dateRange),
      limit,
      sortBy,
    };
    return apiClient.get<DriverUtilizationRow[]>(`${BASE}/driver-utilization`, { params });
  },

  /** PHASE 2: Distance Distribution histogram */
  async getDistanceDistribution(
    dateRange?: { startDate?: Date; endDate?: Date }
  ): Promise<TripDistanceDistributionBucket[]> {
    return apiClient.get<TripDistanceDistributionBucket[]>(`${BASE}/distance-distribution`, {
      params: buildRangeQuery(dateRange),
    });
  },

  /** PHASE 2: Day-of-week x hour heatmap */
  async getDayOfWeekHeatmap(
    dateRange?: { startDate?: Date; endDate?: Date }
  ): Promise<TripHeatmapCell[]> {
    return apiClient.get<TripHeatmapCell[]>(`${BASE}/day-of-week`, {
      params: buildRangeQuery(dateRange),
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