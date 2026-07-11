// frontend/modules/dashboard/hooks/useDashboardData.ts

import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '../services/dashboard.api';
import type { FuelTrendPoint, ExpenseCategoryPoint } from '../types';
import type { ExpenseStats } from '@/shared/types/expense.types';

const dashboardKeys = {
  vehicleStats: ['dashboard', 'vehicle-stats'] as const,
  aiSummary: ['dashboard', 'ai-summary'] as const,
  reminders: ['dashboard', 'reminders'] as const,
  remindersOverdue: ['dashboard', 'reminders', 'overdue'] as const,
  remindersUpcoming: ['dashboard', 'reminders', 'upcoming'] as const,
  fuel: ['dashboard', 'fuel'] as const,
  fuelStats: ['dashboard', 'fuel', 'stats'] as const,
  expenses: ['dashboard', 'expenses'] as const,
  trips: ['dashboard', 'trips'] as const,
  tripStats: ['dashboard', 'trips', 'stats'] as const,
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

/**
 * FIX: previously fetched the full unpaginated reminder list and
 * computed overdue/upcoming buckets by filtering client-side -- a third,
 * independent implementation of "overdue" alongside
 * MaintenanceRepository.getOverdueReminders (used by the Overdue
 * Maintenance page) and getMaintenanceStats (used by the stats cards).
 * Now composes the same two aggregation-backed endpoints those pages
 * use, so all three can never contradict each other again. overdueCount
 * is derived from the overdue list's own length rather than recomputed,
 * so the count and the list it describes can never drift apart.
 */
export function useMaintenanceWidget() {
  const overdueQuery = useQuery({
    queryKey: dashboardKeys.remindersOverdue,
    queryFn: dashboardApi.getOverdueReminders,
    staleTime: 60_000,
  });

  const upcomingQuery = useQuery({
    queryKey: dashboardKeys.remindersUpcoming,
    queryFn: () => dashboardApi.getUpcomingReminders(30),
    staleTime: 60_000,
  });

  const overdue = overdueQuery.data ?? [];
  const upcoming = [...(upcomingQuery.data ?? [])]
    .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())
    .slice(0, 5);

  const isLoading = overdueQuery.isLoading || upcomingQuery.isLoading;
  const isError = overdueQuery.isError || upcomingQuery.isError;

  return {
    data: isLoading ? undefined : { overdue, upcoming, overdueCount: overdue.length },
    isLoading,
    isError,
    refetch: () => {
      overdueQuery.refetch();
      upcomingQuery.refetch();
    },
  };
}

/**
 * FIX: previously fetched the raw unpaginated fuel log list and grouped
 * it by month / summed totals in the browser -- an independent
 * implementation of both the monthly trend and the total cost/volume
 * alongside FuelRepository.getMonthlyFuelConsumption and getFuelStats,
 * which the Fuel page's own charts and stat cards call. Now reads both
 * shared aggregations directly.
 */
export function useFuelTrendsWidget() {
  const monthlyQuery = useQuery({
    queryKey: [...dashboardKeys.fuel, 'monthly'],
    queryFn: () => dashboardApi.getFuelMonthlyConsumption(6),
    staleTime: 60_000,
  });

  const statsQuery = useQuery({
    queryKey: dashboardKeys.fuelStats,
    queryFn: dashboardApi.getFuelStats,
    staleTime: 60_000,
  });

  const points: FuelTrendPoint[] = (monthlyQuery.data ?? [])
    .slice(-6)
    .map((m) => ({
      month: m.month,
      volume: Math.round(m.fuel),
      cost: Math.round(m.cost),
    }));

  const isLoading = monthlyQuery.isLoading || statsQuery.isLoading;
  const isError = monthlyQuery.isError || statsQuery.isError;

  return {
    data: isLoading
      ? undefined
      : {
          points,
          totalVolume: statsQuery.data?.totalFuel ?? 0,
          totalCost: statsQuery.data?.totalCost ?? 0,
        },
    isLoading,
    isError,
    refetch: () => {
      monthlyQuery.refetch();
      statsQuery.refetch();
    },
  };
}

/**
 * FIX: previously fetched the raw unpaginated expense list and summed it
 * client-side -- a second, independent implementation of "total expenses"
 * that inevitably drifted from the Expenses page's own stats cards (which
 * call the same underlying aggregation but scoped to a different default
 * date range). Now calls the shared ExpenseStats aggregate directly;
 * there is exactly one place "total expenses" is computed.
 */
export function useExpenseBreakdownWidget() {
  return useQuery({
    queryKey: dashboardKeys.expenses,
    queryFn: dashboardApi.getExpenseStats,
    staleTime: 60_000,
    select: (stats: ExpenseStats): { categories: ExpenseCategoryPoint[]; total: number } => {
      const total = stats.total ?? 0;
      const byType: Record<string, number> = stats.byType ?? {};

      const categories: ExpenseCategoryPoint[] = Object.entries(byType)
        .map(([name, value]) => ({
          name,
          value,
          percentage: total > 0 ? (value / total) * 100 : 0,
        }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 6);

      return { categories, total };
    },
  });
}

/**
 * FIX: the "recent" list still comes from the raw trip list (a listing,
 * not an aggregate), but totalDistance/totalTrips previously summed that
 * same raw list client-side -- an independent implementation of "total
 * distance" alongside TripRepository.getTripStats, which the Trips page's
 * own stats cards call via /api/trips/stats. Totals now come from that
 * shared aggregation.
 */
export function useRecentTripsWidget() {
  const recentQuery = useQuery({
    queryKey: dashboardKeys.trips,
    queryFn: dashboardApi.getTrips,
    staleTime: 60_000,
    select: (trips) =>
      [...trips]
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 5),
  });

  const statsQuery = useQuery({
    queryKey: dashboardKeys.tripStats,
    queryFn: dashboardApi.getTripStats,
    staleTime: 60_000,
  });

  const isLoading = recentQuery.isLoading || statsQuery.isLoading;
  const isError = recentQuery.isError || statsQuery.isError;

  return {
    data: isLoading
      ? undefined
      : {
          recent: recentQuery.data ?? [],
          totalDistance: statsQuery.data?.totalDistance ?? 0,
          totalTrips: statsQuery.data?.totalTrips ?? 0,
        },
    isLoading,
    isError,
    refetch: () => {
      recentQuery.refetch();
      statsQuery.refetch();
    },
  };
}

export function useRecentActivityWidget() {
  return useQuery({
    queryKey: dashboardKeys.notifications,
    queryFn: () => dashboardApi.getRecentNotifications(6),
    staleTime: 30_000,
  });
}