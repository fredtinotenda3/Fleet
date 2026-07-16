// frontend/modules/fuel/services/fuel.api.ts

import { apiClient } from '@/shared/utils/api-client.utils';
import type { PaginatedResponse } from '@/shared/types/common.types';
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
  /** True when the row was skipped as a duplicate rather than failing validation. */
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

  async getStats(dateRange?: { startDate?: Date; endDate?: Date }): Promise<FuelStats> {
    return apiClient.get<FuelStats>(BASE, { params: { action: 'stats', ...buildRangeParams(dateRange) } });
  },

  async getKpis(dateRange?: { startDate?: Date; endDate?: Date }): Promise<FuelKpis> {
    return apiClient.get<FuelKpis>(BASE, { params: { action: 'kpis', ...buildRangeParams(dateRange) } });
  },

  async getAbnormalConsumption(threshold: number = 2): Promise<AbnormalFuelConsumptionRow[]> {
    return apiClient.get<AbnormalFuelConsumptionRow[]>(BASE, { params: { action: 'abnormal', threshold } });
  },

  async getMonthlyConsumption(months: number = 12): Promise<MonthlyFuelConsumptionPoint[]> {
    return apiClient.get<MonthlyFuelConsumptionPoint[]>(BASE, { params: { action: 'monthly', months } });
  },

  async getTopConsumers(limit: number = 5): Promise<TopFuelConsumerRow[]> {
    return apiClient.get<TopFuelConsumerRow[]>(BASE, { params: { action: 'top-consumers', limit } });
  },

  async getByDriver(
    dateRange?: { startDate?: Date; endDate?: Date },
    limit: number = 10,
    sortBy: FuelByDriverSort = 'volume'
  ): Promise<DriverFuelConsumptionRow[]> {
    return apiClient.get<DriverFuelConsumptionRow[]>(BASE, {
      params: { action: 'by-driver', limit, sortBy, ...buildRangeParams(dateRange) },
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
    // FIX: this call was using apiClient's default 30000ms timeout, so the
    // browser aborted the fetch (surfacing as "Request timeout") right as
    // the server was still working through the batch -- the server itself
    // finished fine (see the `200 in 30390ms` log), the client just wasn't
    // waiting long enough. Import is a bulk op scaling with row count
    // (MAX_IMPORT_ROWS = 2000), so it needs its own generous timeout.
    return apiClient.post<FuelImportResponse>(`${BASE}/import`, { records }, { timeout: 180_000 });
  },

  // ---- Enterprise analytics ----

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
    limit: number = 15
  ): Promise<FuelByStationRow[]> {
    return apiClient.get<FuelByStationRow[]>(BASE, {
      params: { action: 'by-station', limit, ...buildRangeParams(dateRange) },
    });
  },

  async getFuelActivityTrend(
    granularity: FuelTrendGranularity,
    dateRange?: { startDate?: Date; endDate?: Date }
  ): Promise<FuelActivityTrendPoint[]> {
    return apiClient.get<FuelActivityTrendPoint[]>(BASE, {
      params: { action: 'activity-trend', granularity, ...buildRangeParams(dateRange) },
    });
  },

  async getAverageFuelPriceTrend(
    dateRange?: { startDate?: Date; endDate?: Date },
    granularity: FuelTrendGranularity = 'month'
  ): Promise<FuelPriceTrendPoint[]> {
    return apiClient.get<FuelPriceTrendPoint[]>(BASE, {
      params: { action: 'price-trend', granularity, ...buildRangeParams(dateRange) },
    });
  },

  async getFuelTypeDistribution(
    dateRange?: { startDate?: Date; endDate?: Date }
  ): Promise<FuelTypeDistributionRow[]> {
    return apiClient.get<FuelTypeDistributionRow[]>(BASE, {
      params: { action: 'type-distribution', ...buildRangeParams(dateRange) },
    });
  },

  async getFuelingFrequencyByVehicle(
    dateRange?: { startDate?: Date; endDate?: Date },
    limit: number = 20
  ): Promise<FuelFrequencyByVehicleRow[]> {
    return apiClient.get<FuelFrequencyByVehicleRow[]>(BASE, {
      params: { action: 'frequency-by-vehicle', limit, ...buildRangeParams(dateRange) },
    });
  },

  async getFuelCostDistribution(
    dateRange?: { startDate?: Date; endDate?: Date }
  ): Promise<FuelCostDistributionBucket[]> {
    return apiClient.get<FuelCostDistributionBucket[]>(BASE, {
      params: { action: 'cost-distribution', ...buildRangeParams(dateRange) },
    });
  },

  async getFuelEntryHeatmap(dateRange?: { startDate?: Date; endDate?: Date }): Promise<FuelHeatmapCell[]> {
    return apiClient.get<FuelHeatmapCell[]>(BASE, {
      params: { action: 'heatmap', ...buildRangeParams(dateRange) },
    });
  },
};

export default fuelApi;