// frontend/modules/fuel-stations/services/fuel-stations.api.ts

import { apiClient } from '@/shared/utils/api-client.utils';
import type { PaginatedResponse } from '@/shared/types/common.types';
import type { FuelStation, FuelStationFilters } from '../types';
import type { FuelStationFormValues } from '../schemas';

const BASE = '/api/fuel-stations';

export interface FuelStationListParams extends FuelStationFilters {
  page?: number;
  limit?: number;
}

export const fuelStationsApi = {
  async list(params: Partial<FuelStationListParams> = {}): Promise<PaginatedResponse<FuelStation>> {
    return apiClient.get<PaginatedResponse<FuelStation>>(BASE, { params });
  },

  async getById(id: string): Promise<FuelStation> {
    return apiClient.get<FuelStation>(`${BASE}/${id}`);
  },

  async create(payload: FuelStationFormValues): Promise<FuelStation> {
    return apiClient.post<FuelStation>(BASE, payload);
  },

  async update(id: string, payload: Partial<FuelStationFormValues>): Promise<FuelStation> {
    return apiClient.put<FuelStation>(`${BASE}/${id}`, payload);
  },

  async remove(id: string, soft: boolean = true): Promise<{ message: string }> {
    return apiClient.delete<{ message: string }>(`${BASE}/${id}`, { params: { soft } });
  },
};

export default fuelStationsApi;