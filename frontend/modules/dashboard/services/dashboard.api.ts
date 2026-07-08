// frontend/modules/dashboard/services/dashboard.api.ts

import { apiClient } from '@/shared/utils/api-client.utils';
import { API_ENDPOINTS } from '@/shared/config/constants';
import type {
  VehicleStats,
  Reminder,
  FuelLog,
  Expense,
  Trip,
  AIDashboardSummary,
  NotificationFeedItem,
} from '../types';

function unwrapList<T>(response: T[] | { data: T[] }): T[] {
  return Array.isArray(response) ? response : response.data ?? [];
}

export const dashboardApi = {
  async getVehicleStats(): Promise<VehicleStats> {
    return apiClient.get<VehicleStats>(API_ENDPOINTS.vehicles.stats);
  },

  async getAISummary(): Promise<AIDashboardSummary> {
    return apiClient.get<AIDashboardSummary>('/api/ai/dashboard');
  },

  async getReminders(): Promise<Reminder[]> {
    const response = await apiClient.get<Reminder[] | { data: Reminder[] }>(API_ENDPOINTS.maintenance.base);
    return unwrapList(response);
  },

  async getFuelLogs(): Promise<FuelLog[]> {
    const response = await apiClient.get<FuelLog[] | { data: FuelLog[] }>(API_ENDPOINTS.fuel.base);
    return unwrapList(response);
  },

  async getExpenses(): Promise<Expense[]> {
    const response = await apiClient.get<Expense[] | { data: Expense[] }>(API_ENDPOINTS.expenses.base);
    return unwrapList(response);
  },

  async getTrips(): Promise<Trip[]> {
    const response = await apiClient.get<Trip[] | { data: Trip[] }>(API_ENDPOINTS.trips.base);
    return unwrapList(response);
  },

  async getRecentNotifications(limit = 6): Promise<NotificationFeedItem[]> {
    const response = await apiClient.get<{ data: NotificationFeedItem[] }>('/api/notifications', {
      params: { page: 1, limit },
    });
    return response.data ?? [];
  },
};