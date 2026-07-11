// frontend/modules/fuel-cards/services/fuel-cards.api.ts

import { apiClient } from '@/shared/utils/api-client.utils';
import { normalizeListResponse } from '@/shared/utils/pagination.utils';
import type { PaginatedResponse } from '@/shared/types/common.types';
import type { FuelCard, FuelCardFilters } from '../types';
import type { FuelCardFormValues } from '../schemas';

const BASE = '/api/fuel-cards';

export interface FuelCardListParams extends FuelCardFilters {
  page?: number;
  limit?: number;
}

export const fuelCardsApi = {
  /**
   * See fuel-stations.api.ts's list() for why normalizeListResponse() is
   * required here: the controller returns a bare `FuelCard[]` when no
   * `page` param is sent (which is how every current caller invokes it),
   * and without this the Fuel Cards table silently rendered empty.
   */
  async list(params: Partial<FuelCardListParams> = {}): Promise<PaginatedResponse<FuelCard>> {
    const response = await apiClient.get<FuelCard[] | PaginatedResponse<FuelCard>>(BASE, { params });
    return normalizeListResponse(response);
  },

  async getById(id: string): Promise<FuelCard> {
    return apiClient.get<FuelCard>(`${BASE}/${id}`);
  },

  async create(payload: FuelCardFormValues): Promise<FuelCard> {
    return apiClient.post<FuelCard>(BASE, payload);
  },

  async update(id: string, payload: Partial<FuelCardFormValues>): Promise<FuelCard> {
    return apiClient.put<FuelCard>(`${BASE}/${id}`, payload);
  },

  async remove(id: string, soft: boolean = true): Promise<{ message: string }> {
    return apiClient.delete<{ message: string }>(`${BASE}/${id}`, { params: { soft } });
  },
};

export default fuelCardsApi;