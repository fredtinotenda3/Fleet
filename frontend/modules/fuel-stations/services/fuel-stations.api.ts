// frontend/modules/fuel-stations/services/fuel-stations.api.ts

import { apiClient } from '@/shared/utils/api-client.utils';
import { normalizeListResponse } from '@/shared/utils/pagination.utils';
import type { PaginatedResponse } from '@/shared/types/common.types';
import type { FuelStation, FuelStationFilters } from '../types';
import type { FuelStationFormValues } from '../schemas';

const BASE = '/api/fuel-stations';

export interface FuelStationListParams extends FuelStationFilters {
  page?: number;
  limit?: number;
}

export const fuelStationsApi = {
  /**
   * NOTE: when called without `page`/`limit` (as every consumer of this
   * list -- the Fuel Stations page and the station picker in FuelForm --
   * currently does), the controller returns a bare `FuelStation[]`
   * instead of `{data, pagination}`. normalizeListResponse() wraps that
   * consistently so callers can always rely on `.data`/`.pagination`.
   */
  async list(params: Partial<FuelStationListParams> = {}): Promise<PaginatedResponse<FuelStation>> {
    const response = await apiClient.get<FuelStation[] | PaginatedResponse<FuelStation>>(BASE, { params });
    return normalizeListResponse(response);
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