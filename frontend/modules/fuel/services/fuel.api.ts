// frontend/modules/fuel/services/fuel.api.ts

import { apiClient } from '@/shared/utils/api-client.utils';
import type { PaginatedResponse } from '@/shared/types/common.types';
import type { ExportFormat } from '@/shared/export/export.types';
import type { ExportBlobResponse } from '@/shared/utils/export-download.utils';
import type {
  FuelLog,
  FuelTableFilters,
  FuelStats,
  FuelKpis,
  AbnormalFuelConsumptionRow,
  MonthlyFuelConsumptionPoint,
  TopFuelConsumerRow,
  DriverFuelConsumptionRow,
  FuelByDriverSort,
  FuelTrendGranularity,
  VehicleFuelTimelinePoint,
  FuelByStationRow,
  FuelActivityTrendPoint,
  FuelPriceTrendPoint,
  FuelTypeDistributionRow,
  FuelFrequencyByVehicleRow,
  FuelCostDistributionBucket,
  FuelHeatmapCell,
} from '../types';
import type { FuelFormOutput } from '../schemas';

const BASE = '/api/fuellogs';

export interface FuelListParams extends FuelTableFilters {
  page?: number;
  limit?: number;
}

export interface FuelImportRowResult {
  row: number;
  success: boolean;
  identifier?: string;
  error?: string;
  duplicate?: boolean;
}

export interface FuelImportResponse {
  summary: { total: number; succeeded: number; duplicates: number; failed: number };
  results: FuelImportRowResult[];
}

function toIso(value: Date | string | undefined): string | undefined {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString() : value;
}

function buildListQuery(params: Partial<FuelListParams>) {
  return {
    license_plate: params.license_plate,
    unit_id: params.unit_id,
    payment_method: params.payment_method,
    fuel_station_id: params.fuel_station_id,
    fuel_card_id: params.fuel_card_id,
    driver_id: params.driver_id,
    start: toIso(params.startDate),
    end: toIso(params.endDate),
    page: params.page,
    limit: params.limit,
  };
}

function buildRangeParams(dateRange?: { startDate?: Date; endDate?: Date }) {
  return {
    startDate: dateRange?.startDate ? dateRange.startDate.toISOString() : undefined,
    endDate: dateRange?.endDate ? dateRange.endDate.toISOString() : undefined,
  };
}

/**
 * Vehicle-Level Analytics: every analytics call below accepts an
 * optional `licensePlate`. Passing it scopes the SAME query/chart to
 * that one vehicle (server-side, via AnalyticsScope) -- omit it for
 * today's unscoped fleet-wide behaviour. No new endpoints.
 */
function scopeParams(licensePlate?: string) {
  return licensePlate ? { license_plate: licensePlate } : {};
}

export const fuelApi = {
  async list(params: Partial<FuelListParams>): Promise<PaginatedResponse<FuelLog>> {
    return apiClient.get<PaginatedResponse<FuelLog>>(BASE, { params: buildListQuery(params) });
  },

  async getById(id: string): Promise<FuelLog> {
    return apiClient.get<FuelLog>(BASE, { params: { id } });
  },

  async create(payload: FuelFormOutput): Promise<FuelLog> {
    return apiClient.post<FuelLog>(BASE, payload);
  },

  async update(id: string, payload: Partial<FuelFormOutput>): Promise<FuelLog> {
    return apiClient.put<FuelLog>(BASE, payload, { params: { id } });
  },

  async remove(id: string, soft: boolean = true): Promise<{ message: string }> {
    return apiClient.delete<{ message: string }>(BASE, { params: { id, soft } });
  },

  async exportFile(filters: Partial<FuelTableFilters>, format: ExportFormat = 'csv'): Promise<ExportBlobResponse> {
    return apiClient.getBlob(BASE, {
      params: {
        action: 'export',
        license_plate: filters.license_plate,
        unit_id: filters.unit_id,
        payment_method: filters.payment_method,
        fuel_station_id: filters.fuel_station_id,
        fuel_card_id: filters.fuel_card_id,
        driver_id: filters.driver_id,
        start: toIso(filters.startDate),
        end: toIso(filters.endDate),
        format,
      },
    });
  },

  async getStats(
    dateRange?: { startDate?: Date; endDate?: Date },
    licensePlate?: string
  ): Promise<FuelStats> {
    return apiClient.get<FuelStats>(BASE, {
      params: { action: 'stats', ...buildRangeParams(dateRange), ...scopeParams(licensePlate) },
    });
  },

  async getKpis(
    dateRange?: { startDate?: Date; endDate?: Date },
    licensePlate?: string
  ): Promise<FuelKpis> {
    return apiClient.get<FuelKpis>(BASE, {
      params: { action: 'kpis', ...buildRangeParams(dateRange), ...scopeParams(licensePlate) },
    });
  },

  async getAbnormalConsumption(threshold: number = 2, licensePlate?: string): Promise<AbnormalFuelConsumptionRow[]> {
    return apiClient.get<AbnormalFuelConsumptionRow[]>(BASE, {
      params: { action: 'abnormal', threshold, ...scopeParams(licensePlate) },
    });
  },

  async getMonthlyConsumption(months: number = 12, licensePlate?: string): Promise<MonthlyFuelConsumptionPoint[]> {
    return apiClient.get<MonthlyFuelConsumptionPoint[]>(BASE, {
      params: { action: 'monthly', months, ...scopeParams(licensePlate) },
    });
  },

  async getTopConsumers(limit: number = 5, licensePlate?: string): Promise<TopFuelConsumerRow[]> {
    return apiClient.get<TopFuelConsumerRow[]>(BASE, {
      params: { action: 'top-consumers', limit, ...scopeParams(licensePlate) },
    });
  },

  async getByDriver(
    dateRange?: { startDate?: Date; endDate?: Date },
    limit: number = 10,
    sortBy: FuelByDriverSort = 'volume',
    licensePlate?: string
  ): Promise<DriverFuelConsumptionRow[]> {
    return apiClient.get<DriverFuelConsumptionRow[]>(BASE, {
      params: {
        action: 'by-driver',
        limit,
        sortBy,
        ...buildRangeParams(dateRange),
        ...scopeParams(licensePlate),
      },
    });
  },

  async uploadReceipt(file: File): Promise<{ url: string }> {
    const formData = new FormData();
    formData.append('file', file);
    const response = await fetch(`${BASE}/receipt`, { method: 'POST', body: formData });
    const body = await response.json();
    if (!response.ok || body?.success === false) {
      throw new Error(body?.error?.message || 'Failed to upload receipt');
    }
    return body.data;
  },

  async importLogs(records: Record<string, unknown>[]): Promise<FuelImportResponse> {
    return apiClient.post<FuelImportResponse>(`${BASE}/import`, { records }, { timeout: 180_000 });
  },

  // ---- Enterprise analytics (scope-aware) ----

  async getVehicleFuelTimeline(params: {
    license_plate?: string;
    startDate?: Date;
    endDate?: Date;
  }): Promise<VehicleFuelTimelinePoint[]> {
    return apiClient.get<VehicleFuelTimelinePoint[]>(BASE, {
      params: {
        action: 'vehicle-timeline',
        license_plate: params.license_plate,
        ...buildRangeParams(params),
      },
    });
  },

  async getFuelByStation(
    dateRange?: { startDate?: Date; endDate?: Date },
    limit: number = 15,
    licensePlate?: string
  ): Promise<FuelByStationRow[]> {
    return apiClient.get<FuelByStationRow[]>(BASE, {
      params: { action: 'by-station', limit, ...buildRangeParams(dateRange), ...scopeParams(licensePlate) },
    });
  },

  async getFuelActivityTrend(
    granularity: FuelTrendGranularity,
    dateRange?: { startDate?: Date; endDate?: Date },
    licensePlate?: string
  ): Promise<FuelActivityTrendPoint[]> {
    return apiClient.get<FuelActivityTrendPoint[]>(BASE, {
      params: {
        action: 'activity-trend',
        granularity,
        ...buildRangeParams(dateRange),
        ...scopeParams(licensePlate),
      },
    });
  },

  async getAverageFuelPriceTrend(
    dateRange?: { startDate?: Date; endDate?: Date },
    granularity: FuelTrendGranularity = 'month',
    licensePlate?: string
  ): Promise<FuelPriceTrendPoint[]> {
    return apiClient.get<FuelPriceTrendPoint[]>(BASE, {
      params: {
        action: 'price-trend',
        granularity,
        ...buildRangeParams(dateRange),
        ...scopeParams(licensePlate),
      },
    });
  },

  async getFuelTypeDistribution(
    dateRange?: { startDate?: Date; endDate?: Date },
    licensePlate?: string
  ): Promise<FuelTypeDistributionRow[]> {
    return apiClient.get<FuelTypeDistributionRow[]>(BASE, {
      params: { action: 'type-distribution', ...buildRangeParams(dateRange), ...scopeParams(licensePlate) },
    });
  },

  async getFuelingFrequencyByVehicle(
    dateRange?: { startDate?: Date; endDate?: Date },
    limit: number = 20,
    licensePlate?: string
  ): Promise<FuelFrequencyByVehicleRow[]> {
    return apiClient.get<FuelFrequencyByVehicleRow[]>(BASE, {
      params: {
        action: 'frequency-by-vehicle',
        limit,
        ...buildRangeParams(dateRange),
        ...scopeParams(licensePlate),
      },
    });
  },

  async getFuelCostDistribution(
    dateRange?: { startDate?: Date; endDate?: Date },
    licensePlate?: string
  ): Promise<FuelCostDistributionBucket[]> {
    return apiClient.get<FuelCostDistributionBucket[]>(BASE, {
      params: { action: 'cost-distribution', ...buildRangeParams(dateRange), ...scopeParams(licensePlate) },
    });
  },

  async getFuelEntryHeatmap(
    dateRange?: { startDate?: Date; endDate?: Date },
    licensePlate?: string
  ): Promise<FuelHeatmapCell[]> {
    return apiClient.get<FuelHeatmapCell[]>(BASE, {
      params: { action: 'heatmap', ...buildRangeParams(dateRange), ...scopeParams(licensePlate) },
    });
  },
};

export default fuelApi;