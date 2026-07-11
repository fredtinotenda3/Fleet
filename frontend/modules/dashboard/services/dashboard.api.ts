/* eslint-disable @typescript-eslint/no-unused-vars */
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
import type { ExpenseStats } from '@/shared/types/expense.types';
import type { FuelStats } from '@/shared/types/fuel.types';
import type { TripStats } from '@/shared/types/trip.types';

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

  /**
   * Powers the dashboard's "Upcoming maintenance" widget overdue/upcoming
   * lists. Calls the exact same aggregation-backed endpoints
   * (/api/reminders?action=overdue|upcoming -> MaintenanceRepository's
   * getOverdueReminders/getUpcomingReminders) that OverdueMaintenancePage
   * and UpcomingMaintenancePage use, so the dashboard widget can never
   * disagree with those pages or with getMaintenanceStats' overdue count
   * -- all three now share one "unresolved AND due_date vs now" rule.
   */
  async getOverdueReminders(): Promise<Reminder[]> {
    const response = await apiClient.get<Reminder[] | { data: Reminder[] }>(API_ENDPOINTS.maintenance.base, {
      params: { action: 'overdue' },
    });
    return unwrapList(response);
  },

  async getUpcomingReminders(daysAhead = 30): Promise<Reminder[]> {
    const response = await apiClient.get<Reminder[] | { data: Reminder[] }>(API_ENDPOINTS.maintenance.base, {
      params: { action: 'upcoming', daysAhead },
    });
    return unwrapList(response);
  },

  async getFuelLogs(): Promise<FuelLog[]> {
    const response = await apiClient.get<FuelLog[] | { data: FuelLog[] }>(API_ENDPOINTS.fuel.base);
    return unwrapList(response);
  },

  /**
   * FIX: backs the "Fuel spend" KPI card and Fuel trends widget totals.
   * Previously the widget fetched the raw unpaginated fuel log list and
   * summed fuel_volume/cost in the browser -- a second, independent
   * implementation of "total fuel cost/volume" alongside
   * FuelRepository.getFuelStats, which the Fuel page's own stat cards
   * call. Never sum raw fuel logs client-side; always read this
   * aggregate.
   */
  async getFuelStats(): Promise<FuelStats> {
    return apiClient.get<FuelStats>('/api/fuellogs', { params: { action: 'stats' } });
  },

  /**
   * FIX: backs the Fuel trends monthly chart. Previously grouped raw
   * fuel logs by month in the browser. Now reads
   * FuelRepository.getMonthlyFuelConsumption via the same
   * /api/fuellogs?action=monthly endpoint the Fuel page uses.
   */
  async getFuelMonthlyConsumption(
    months: number = 6
  ): Promise<Array<{ month: string; fuel: number; cost: number }>> {
    return apiClient.get('/api/fuellogs', { params: { action: 'monthly', months } });
  },

  /**
   * Backs the dashboard's expense KPI + breakdown widget. Deliberately
   * calls the same /api/expenses?action=stats endpoint (and therefore
   * the same ExpenseRepository.getExpenseStats aggregation) that the
   * Expenses page's stat cards use -- this is the fix for the
   * dashboard-vs-expenses-page total mismatch. Never sum raw expense
   * rows client-side; always read the shared aggregate.
   */
  async getExpenseStats(): Promise<ExpenseStats> {
    return apiClient.get<ExpenseStats>('/api/expenses', { params: { action: 'stats' } });
  },

  async getTrips(): Promise<Trip[]> {
    const response = await apiClient.get<Trip[] | { data: Trip[] }>(API_ENDPOINTS.trips.base);
    return unwrapList(response);
  },

  /**
   * FIX: backs the "Recent trips" widget's totalDistance/totalTrips
   * summary line. Previously computed by summing distance_calculated
   * across the raw unpaginated trip list fetched via getTrips() above --
   * a second, independent "total distance" alongside
   * TripRepository.getTripStats, which the Trips page's own stats cards
   * call via /api/trips/stats. The individual "recent" trip rows shown
   * in the widget still come from getTrips() (that's a listing, not an
   * aggregate), but the totals now come from this shared aggregation.
   */
  async getTripStats(): Promise<TripStats> {
    return apiClient.get<TripStats>('/api/trips/stats');
  },

  async getRecentNotifications(limit = 6): Promise<NotificationFeedItem[]> {
    const response = await apiClient.get<{ data: NotificationFeedItem[] }>('/api/notifications', {
      params: { page: 1, limit },
    });
    return response.data ?? [];
  },
};