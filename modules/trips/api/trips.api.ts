// modules/trips/api/trips.api.ts

import { apiClient } from '@/shared/utils/api-client.utils';
import { Trip, TripCreateDTO, TripUpdateDTO, TripFilters, TripStats } from '@/shared/types/trip.types';
import { PaginatedResponse } from '@/shared/types/common.types';

const BASE_URL = '/trips';

export const tripsApi = {
  async getTrips(filters: TripFilters = {}, page: number = 1, limit: number = 10): Promise<PaginatedResponse<Trip>> {
    const params: Record<string, string | number | boolean | undefined> = {
      page,
      limit,
      ...(filters.license_plate && { license_plate: filters.license_plate }),
      ...(filters.mode && { mode: filters.mode }),
      ...(filters.driver_id && { driver_id: filters.driver_id }),
      ...(filters.startDate && { startDate: filters.startDate.toISOString() }),
      ...(filters.endDate && { endDate: filters.endDate.toISOString() }),
    };
    
    return apiClient.get<PaginatedResponse<Trip>>(BASE_URL, { params });
  },

  async getTripById(id: string): Promise<Trip> {
    return apiClient.get<Trip>(BASE_URL, { params: { id } });
  },

  async getTripStats(dateRange?: { startDate?: Date; endDate?: Date }): Promise<TripStats> {
    const params: Record<string, string | undefined> = {};
    if (dateRange?.startDate) params.startDate = dateRange.startDate.toISOString();
    if (dateRange?.endDate) params.endDate = dateRange.endDate.toISOString();
    
    return apiClient.get<TripStats>(BASE_URL, { params: { action: 'stats', ...params } });
  },

  async getDailyDistance(days: number = 30): Promise<Array<{ date: string; distance: number }>> {
    return apiClient.get<Array<{ date: string; distance: number }>>(BASE_URL, {
      params: { action: 'daily', days },
    });
  },

  async createTrip(data: TripCreateDTO): Promise<Trip> {
    return apiClient.post<Trip>(BASE_URL, data);
  },

  async updateTrip(id: string, data: TripUpdateDTO): Promise<Trip> {
    return apiClient.put<Trip>(BASE_URL, data, { params: { id } });
  },

  async deleteTrip(id: string): Promise<void> {
    await apiClient.delete<void>(BASE_URL, { params: { id } });
  },
};

export default tripsApi;