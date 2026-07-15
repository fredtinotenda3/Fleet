// frontend/modules/drivers/services/drivers.api.ts

import { apiClient } from '@/shared/utils/api-client.utils';
import { normalizeListResponse } from '@/shared/utils/pagination.utils';
import type { PaginatedResponse } from '@/shared/types/common.types';
import type { Driver, DriverFilters } from '../types';
import type { DriverFormValues } from '../schemas';

const BASE = '/api/drivers';

export interface DriverListParams extends DriverFilters {
  page?: number;
  limit?: number;
}

export const driversApi = {
  /**
   * Same shape as fuelStationsApi.list()/fuelCardsApi.list(): when called
   * without `page`/`limit` (every current picker call site), the
   * controller returns a bare `Driver[]`. normalizeListResponse() wraps
   * that consistently so callers can always rely on `.data`/`.pagination`.
   */
  async list(params: Partial<DriverListParams> = {}): Promise<PaginatedResponse<Driver>> {
    const response = await apiClient.get<Driver[] | PaginatedResponse<Driver>>(BASE, { params });
    return normalizeListResponse(response);
  },

  async getById(id: string): Promise<Driver> {
    return apiClient.get<Driver>(`${BASE}/${id}`);
  },

  async create(payload: DriverFormValues): Promise<Driver> {
    return apiClient.post<Driver>(BASE, payload);
  },

  async update(id: string, payload: Partial<DriverFormValues>): Promise<Driver> {
    return apiClient.put<Driver>(`${BASE}/${id}`, payload);
  },

  async remove(id: string, soft: boolean = true): Promise<{ message: string }> {
    return apiClient.delete<{ message: string }>(`${BASE}/${id}`, { params: { soft } });
  },
};

export default driversApi;