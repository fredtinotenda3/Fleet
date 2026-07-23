// frontend/modules/maintenance/hooks/useMaintenance.ts

import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { maintenanceApi, type MaintenanceListParams } from '../services/maintenance.api';
import type { Reminder } from '../types';

export const maintenanceKeys = {
  all: ['maintenance'] as const,
  lists: () => [...maintenanceKeys.all, 'list'] as const,
  list: (params: Partial<MaintenanceListParams>) => [...maintenanceKeys.lists(), params] as const,
  details: () => [...maintenanceKeys.all, 'detail'] as const,
  detail: (id: string) => [...maintenanceKeys.details(), id] as const,
  stats: () => [...maintenanceKeys.all, 'stats'] as const,
  overdue: () => [...maintenanceKeys.all, 'overdue'] as const,
  upcoming: (daysAhead: number) => [...maintenanceKeys.all, 'upcoming', daysAhead] as const,
  byVehicle: (plate: string, page: number) => [...maintenanceKeys.all, 'vehicle', plate, page] as const,
  all_unpaginated: () => [...maintenanceKeys.all, 'all'] as const,
};

export function useMaintenanceList(params: Partial<MaintenanceListParams>) {
  return useQuery({
    queryKey: maintenanceKeys.list(params),
    queryFn: () => maintenanceApi.list(params),
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  });
}

export function useMaintenanceRecord(id: string | undefined, options?: Partial<UseQueryOptions<Reminder>>) {
  return useQuery({
    queryKey: maintenanceKeys.detail(id ?? ''),
    queryFn: () => maintenanceApi.getById(id as string),
    enabled: Boolean(id),
    staleTime: 30_000,
    ...options,
  });
}

export function useMaintenanceStats() {
  return useQuery({
    queryKey: maintenanceKeys.stats(),
    queryFn: () => maintenanceApi.getStats(),
    staleTime: 60_000,
  });
}

export function useOverdueMaintenance() {
  return useQuery({
    queryKey: maintenanceKeys.overdue(),
    queryFn: () => maintenanceApi.getOverdue(),
    staleTime: 30_000,
  });
}

export function useUpcomingMaintenance(daysAhead: number = 7) {
  return useQuery({
    queryKey: maintenanceKeys.upcoming(daysAhead),
    queryFn: () => maintenanceApi.getUpcoming(daysAhead),
    staleTime: 30_000,
  });
}

export function useVehicleMaintenanceHistory(licensePlate: string | undefined, page = 1, limit = 10) {
  return useQuery({
    queryKey: maintenanceKeys.byVehicle(licensePlate ?? '', page),
    queryFn: () => maintenanceApi.getByVehicle(licensePlate as string, { page, limit }),
    enabled: Boolean(licensePlate),
    staleTime: 30_000,
  });
}

/** Unpaginated fetch for dashboard charts/calendar -- reuses the controller's legacy no-page-param branch. */
export function useAllMaintenanceRecords(filters: Partial<MaintenanceListParams> = {}) {
  return useQuery({
    queryKey: [...maintenanceKeys.all_unpaginated(), filters],
    queryFn: () => maintenanceApi.list(filters),
    staleTime: 60_000,
    select: (result) => result.data,
  });
}

export function useMaintenanceCostTrend(months: number = 12) {
  return useQuery({
    queryKey: [...maintenanceKeys.all, 'cost-trend', months],
    queryFn: () => maintenanceApi.getCostTrend(months),
    staleTime: 60_000,
  });
}

export function useRepairFrequencyByVehicle(limit: number = 20) {
  return useQuery({
    queryKey: [...maintenanceKeys.all, 'repair-frequency', limit],
    queryFn: () => maintenanceApi.getRepairFrequencyByVehicle(limit),
    staleTime: 60_000,
  });
}

export function useMostExpensiveVehicles(limit: number = 20) {
  return useQuery({
    queryKey: [...maintenanceKeys.all, 'most-expensive-vehicles', limit],
    queryFn: () => maintenanceApi.getMostExpensiveVehicles(limit),
    staleTime: 60_000,
  });
}

export function useDowntimeEstimate(limit: number = 20) {
  return useQuery({
    queryKey: [...maintenanceKeys.all, 'downtime-estimate', limit],
    queryFn: () => maintenanceApi.getDowntimeEstimate(limit),
    staleTime: 60_000,
  });
}