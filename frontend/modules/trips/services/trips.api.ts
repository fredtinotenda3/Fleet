// frontend/modules/trips/services/trips.api.ts

import { apiClient } from '@/shared/utils/api-client.utils';
import type { PaginatedResponse } from '@/shared/types/common.types';
import type { Trip, TripStats, TripTableFilters } from '../types';
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
    start: toIso(params.startDate),
    end: toIso(params.endDate),
    page: params.page,
    limit: params.limit,
  };
}

export const tripsApi = {
  async list(params: Partial<TripListParams>): Promise<PaginatedResponse<Trip>> {
    return apiClient.get<PaginatedResponse<Trip>>(BASE, { params: buildListQuery(params) });
  },

  async getById(id: string): Promise<Trip> {
    return apiClient.get<Trip>(`${BASE}/${id}`);
  },

  async getStats(dateRange?: { startDate?: Date; endDate?: Date }): Promise<TripStats> {
    const params: Record<string, string | undefined> = {};
    if (dateRange?.startDate) params.startDate = dateRange.startDate.toISOString();
    if (dateRange?.endDate) params.endDate = dateRange.endDate.toISOString();
    return apiClient.get<TripStats>(`${BASE}/stats`, { params });
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
};