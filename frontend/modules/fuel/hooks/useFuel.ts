// frontend/modules/fuel/hooks/useFuel.ts

import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { apiClient } from '@/shared/utils/api-client.utils';
import { fuelApi, type FuelListParams } from '../services/fuel.api';
import type { FuelLog, FuelVolumeUnitOption } from '../types';

export const fuelKeys = {
  all: ['fuel'] as const,
  lists: () => [...fuelKeys.all, 'list'] as const,
  list: (params: Partial<FuelListParams>) => [...fuelKeys.lists(), params] as const,
  details: () => [...fuelKeys.all, 'detail'] as const,
  detail: (id: string) => [...fuelKeys.details(), id] as const,
  stats: (range?: string) => [...fuelKeys.all, 'stats', range] as const,
  kpis: (range?: string) => [...fuelKeys.all, 'kpis', range] as const,
  abnormal: (threshold: number) => [...fuelKeys.all, 'abnormal', threshold] as const,
  monthly: (months: number) => [...fuelKeys.all, 'monthly', months] as const,
  topConsumers: (limit: number) => [...fuelKeys.all, 'top-consumers', limit] as const,
  byDriver: (range?: string, limit?: number) => [...fuelKeys.all, 'by-driver', range, limit] as const,
};

export function useFuelLogsList(params: Partial<FuelListParams>) {
  return useQuery({
    queryKey: fuelKeys.list(params),
    queryFn: () => fuelApi.list(params),
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  });
}

export function useFuelLog(id: string | undefined, options?: Partial<UseQueryOptions<FuelLog>>) {
  return useQuery({
    queryKey: fuelKeys.detail(id ?? ''),
    queryFn: () => fuelApi.getById(id as string),
    enabled: Boolean(id),
    staleTime: 30_000,
    ...options,
  });
}

export function useFuelStats(dateRange?: { startDate?: Date; endDate?: Date }) {
  const rangeKey = dateRange
    ? `${dateRange.startDate?.toISOString() ?? ''}-${dateRange.endDate?.toISOString() ?? ''}`
    : undefined;

  return useQuery({
    queryKey: fuelKeys.stats(rangeKey),
    queryFn: () => fuelApi.getStats(dateRange),
    staleTime: 60_000,
  });
}

export function useFuelKpis(dateRange?: { startDate?: Date; endDate?: Date }) {
  const rangeKey = dateRange
    ? `${dateRange.startDate?.toISOString() ?? ''}-${dateRange.endDate?.toISOString() ?? ''}`
    : undefined;

  return useQuery({
    queryKey: fuelKeys.kpis(rangeKey),
    queryFn: () => fuelApi.getKpis(dateRange),
    staleTime: 60_000,
  });
}

export function useAbnormalFuelConsumption(threshold: number = 2) {
  return useQuery({
    queryKey: fuelKeys.abnormal(threshold),
    queryFn: () => fuelApi.getAbnormalConsumption(threshold),
    staleTime: 60_000,
  });
}

export function useMonthlyFuelConsumption(months: number = 12) {
  return useQuery({
    queryKey: fuelKeys.monthly(months),
    queryFn: () => fuelApi.getMonthlyConsumption(months),
    staleTime: 60_000,
  });
}

export function useTopFuelConsumers(limit: number = 5) {
  return useQuery({
    queryKey: fuelKeys.topConsumers(limit),
    queryFn: () => fuelApi.getTopConsumers(limit),
    staleTime: 60_000,
  });
}

/** NEW: powers FuelByDriverChart on the dashboard. */
export function useFuelByDriver(dateRange?: { startDate?: Date; endDate?: Date }, limit: number = 10) {
  const rangeKey = dateRange
    ? `${dateRange.startDate?.toISOString() ?? ''}-${dateRange.endDate?.toISOString() ?? ''}`
    : undefined;

  return useQuery({
    queryKey: fuelKeys.byDriver(rangeKey, limit),
    queryFn: () => fuelApi.getByDriver(dateRange, limit),
    staleTime: 60_000,
  });
}

export function useFuelVolumeUnits() {
  return useQuery({
    queryKey: ['units'],
    queryFn: () => apiClient.get<FuelVolumeUnitOption[]>('/api/units'),
    staleTime: 5 * 60_000,
    select: (units) => units.filter((u) => u.type === 'volume'),
  });
}

/** Powers the "Vehicle Fuel History" page: every fuel entry for one plate. */
export function useVehicleFuelHistory(licensePlate: string | undefined, limit: number = 200) {
  return useQuery({
    queryKey: fuelKeys.list({ license_plate: licensePlate, limit }),
    queryFn: () => fuelApi.list({ license_plate: licensePlate, page: 1, limit }),
    enabled: Boolean(licensePlate),
    staleTime: 30_000,
  });
}