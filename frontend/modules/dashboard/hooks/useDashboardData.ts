// frontend/modules/dashboard/hooks/useDashboardData.ts

import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '../services/dashboard.api';
import type { FuelTrendPoint, ExpenseCategoryPoint } from '../types';

const dashboardKeys = {
  vehicleStats: ['dashboard', 'vehicle-stats'] as const,
  aiSummary: ['dashboard', 'ai-summary'] as const,
  reminders: ['dashboard', 'reminders'] as const,
  fuel: ['dashboard', 'fuel'] as const,
  expenses: ['dashboard', 'expenses'] as const,
  trips: ['dashboard', 'trips'] as const,
  notifications: ['dashboard', 'notifications'] as const,
};

export function useVehicleStatsWidget() {
  return useQuery({
    queryKey: dashboardKeys.vehicleStats,
    queryFn: dashboardApi.getVehicleStats,
    staleTime: 60_000,
  });
}

export function useAIDashboardWidget() {
  return useQuery({
    queryKey: dashboardKeys.aiSummary,
    queryFn: dashboardApi.getAISummary,
    staleTime: 5 * 60_000,
    retry: 0,
  });
}

export function useMaintenanceWidget() {
  return useQuery({
    queryKey: dashboardKeys.reminders,
    queryFn: dashboardApi.getReminders,
    staleTime: 60_000,
    select: (reminders) => {
      const now = Date.now();
      const overdue = reminders.filter(
        (r) => r.status !== 'completed' && r.status !== 'cancelled' && new Date(r.due_date).getTime() < now
      );
      const upcoming = reminders
        .filter(
          (r) =>
            r.status !== 'completed' &&
            r.status !== 'cancelled' &&
            new Date(r.due_date).getTime() >= now
        )
        .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())
        .slice(0, 5);
      return { overdue, upcoming, overdueCount: overdue.length };
    },
  });
}

export function useFuelTrendsWidget() {
  return useQuery({
    queryKey: dashboardKeys.fuel,
    queryFn: dashboardApi.getFuelLogs,
    staleTime: 60_000,
    select: (logs): { points: FuelTrendPoint[]; totalVolume: number; totalCost: number } => {
      const byMonth = new Map<string, { volume: number; cost: number }>();
      let totalVolume = 0;
      let totalCost = 0;

      for (const log of logs) {
        const date = new Date(log.date);
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const entry = byMonth.get(key) ?? { volume: 0, cost: 0 };
        entry.volume += log.fuel_volume ?? 0;
        entry.cost += log.cost ?? 0;
        byMonth.set(key, entry);
        totalVolume += log.fuel_volume ?? 0;
        totalCost += log.cost ?? 0;
      }

      const points = Array.from(byMonth.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-6)
        .map(([month, value]) => ({ month, volume: Math.round(value.volume), cost: Math.round(value.cost) }));

      return { points, totalVolume, totalCost };
    },
  });
}

export function useExpenseBreakdownWidget() {
  return useQuery({
    queryKey: dashboardKeys.expenses,
    queryFn: dashboardApi.getExpenses,
    staleTime: 60_000,
    select: (expenses): { categories: ExpenseCategoryPoint[]; total: number } => {
      const byCategory = new Map<string, number>();
      let total = 0;

      for (const expense of expenses) {
        const name = expense.expense_type?.name || expense.expense_type?.category || 'Other';
        byCategory.set(name, (byCategory.get(name) ?? 0) + (expense.amount ?? 0));
        total += expense.amount ?? 0;
      }

      const categories = Array.from(byCategory.entries())
        .map(([name, value]) => ({ name, value, percentage: total > 0 ? (value / total) * 100 : 0 }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 6);

      return { categories, total };
    },
  });
}

export function useRecentTripsWidget() {
  return useQuery({
    queryKey: dashboardKeys.trips,
    queryFn: dashboardApi.getTrips,
    staleTime: 60_000,
    select: (trips) => {
      const totalDistance = trips.reduce((sum, trip) => sum + (trip.distance_calculated ?? 0), 0);
      const recent = [...trips]
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 5);
      return { recent, totalDistance, totalTrips: trips.length };
    },
  });
}

export function useRecentActivityWidget() {
  return useQuery({
    queryKey: dashboardKeys.notifications,
    queryFn: () => dashboardApi.getRecentNotifications(6),
    staleTime: 30_000,
  });
}