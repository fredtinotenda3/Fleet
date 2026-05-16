// modules/fuel/api/fuel.api.ts

import { apiClient } from '@/shared/utils/api-client.utils';
import { FuelLog, FuelLogCreateDTO, FuelLogUpdateDTO, FuelFilters, FuelStats } from '@/shared/types/fuel.types';
import { PaginatedResponse } from '@/shared/types/common.types';

const BASE_URL = '/fuellogs';

export const fuelApi = {
  async getFuelLogs(filters: FuelFilters = {}, page: number = 1, limit: number = 10): Promise<PaginatedResponse<FuelLog>> {
    const params: Record<string, string | number | boolean | undefined> = {
      page,
      limit,
      ...(filters.license_plate && { license_plate: filters.license_plate }),
      ...(filters.unit_id && { unit_id: filters.unit_id }),
      ...(filters.startDate && { startDate: filters.startDate.toISOString() }),
      ...(filters.endDate && { endDate: filters.endDate.toISOString() }),
    };
    
    return apiClient.get<PaginatedResponse<FuelLog>>(BASE_URL, { params });
  },

  async getFuelLogById(id: string): Promise<FuelLog> {
    return apiClient.get<FuelLog>(BASE_URL, { params: { id } });
  },

  async getFuelStats(dateRange?: { startDate?: Date; endDate?: Date }): Promise<FuelStats> {
    const params: Record<string, string | undefined> = {};
    if (dateRange?.startDate) params.startDate = dateRange.startDate.toISOString();
    if (dateRange?.endDate) params.endDate = dateRange.endDate.toISOString();
    
    return apiClient.get<FuelStats>(BASE_URL, { params: { action: 'stats', ...params } });
  },

  async getMonthlyFuelConsumption(months: number = 12): Promise<Array<{ month: string; fuel: number; cost: number }>> {
    return apiClient.get<Array<{ month: string; fuel: number; cost: number }>>(BASE_URL, {
      params: { action: 'monthly', months },
    });
  },

  async getTopFuelConsumers(limit: number = 5): Promise<Array<{ license_plate: string; totalFuel: number; totalCost: number }>> {
    return apiClient.get<Array<{ license_plate: string; totalFuel: number; totalCost: number }>>(BASE_URL, {
      params: { action: 'top-consumers', limit },
    });
  },

  async createFuelLog(data: FuelLogCreateDTO): Promise<FuelLog> {
    return apiClient.post<FuelLog>(BASE_URL, data);
  },

  async updateFuelLog(id: string, data: FuelLogUpdateDTO): Promise<FuelLog> {
    return apiClient.put<FuelLog>(BASE_URL, data, { params: { id } });
  },

  async deleteFuelLog(id: string): Promise<void> {
    await apiClient.delete<void>(BASE_URL, { params: { id } });
  },
};

export default fuelApi;