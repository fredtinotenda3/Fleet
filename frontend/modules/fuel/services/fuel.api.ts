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
}

export interface FuelImportResponse {
  summary: { total: number; succeeded: number; failed: number };
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
    // NEW
    driver_id: params.driver_id,
    start: toIso(params.startDate),
    end: toIso(params.endDate),
    page: params.page,
    limit: params.limit,
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
    const params: Record<string, string | undefined> = { action: 'stats' };
    if (dateRange?.startDate) params.startDate = dateRange.startDate.toISOString();
    if (dateRange?.endDate) params.endDate = dateRange.endDate.toISOString();
    return apiClient.get<FuelStats>(BASE, { params });
  },

  async getKpis(dateRange?: { startDate?: Date; endDate?: Date }): Promise<FuelKpis> {
    const params: Record<string, string | undefined> = { action: 'kpis' };
    if (dateRange?.startDate) params.startDate = dateRange.startDate.toISOString();
    if (dateRange?.endDate) params.endDate = dateRange.endDate.toISOString();
    return apiClient.get<FuelKpis>(BASE, { params });
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

  /** NEW: powers the Fuel-by-Driver dashboard chart. */
  async getByDriver(
    dateRange?: { startDate?: Date; endDate?: Date },
    limit: number = 10
  ): Promise<DriverFuelConsumptionRow[]> {
    const params: Record<string, string | number | undefined> = { action: 'by-driver', limit };
    if (dateRange?.startDate) params.startDate = dateRange.startDate.toISOString();
    if (dateRange?.endDate) params.endDate = dateRange.endDate.toISOString();
    return apiClient.get<DriverFuelConsumptionRow[]>(BASE, { params });
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
    return apiClient.post<FuelImportResponse>(`${BASE}/import`, { records });
  },
};

export default fuelApi;