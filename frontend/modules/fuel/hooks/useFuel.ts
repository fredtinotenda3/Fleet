// frontend/modules/fuel/hooks/useFuel.ts

import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { apiClient } from '@/shared/utils/api-client.utils';
import { fuelApi, type FuelListParams } from '../services/fuel.api';
import type {
  FuelLog,
  FuelVolumeUnitOption,
  FuelByDriverSort,
  FuelTrendGranularity,
} from '../types';

type DateRange = { startDate?: Date; endDate?: Date } | undefined;

function rangeKey(dateRange: DateRange): string | undefined {
  return dateRange
    ? `${dateRange.startDate?.toISOString() ?? ''}-${dateRange.endDate?.toISOString() ?? ''}`
    : undefined;
}

export const fuelKeys = {
  all: ['fuel'] as const,
  lists: () => [...fuelKeys.all, 'list'] as const,
  list: (params: Partial<FuelListParams>) => [...fuelKeys.lists(), params] as const,
  details: () => [...fuelKeys.all, 'detail'] as const,
  detail: (id: string) => [...fuelKeys.details(), id] as const,
  stats: (range?: string, scope?: string) => [...fuelKeys.all, 'stats', range, scope] as const,
  kpis: (range?: string, scope?: string) => [...fuelKeys.all, 'kpis', range, scope] as const,
  abnormal: (threshold: number, scope?: string) => [...fuelKeys.all, 'abnormal', threshold, scope] as const,
  monthly: (months: number, scope?: string) => [...fuelKeys.all, 'monthly', months, scope] as const,
  topConsumers: (limit: number, scope?: string) => [...fuelKeys.all, 'top-consumers', limit, scope] as const,
  byDriver: (range?: string, limit?: number, sortBy?: FuelByDriverSort, scope?: string) =>
    [...fuelKeys.all, 'by-driver', range, limit, sortBy, scope] as const,
  vehicleTimeline: (plate?: string, range?: string) =>
    [...fuelKeys.all, 'vehicle-timeline', plate, range] as const,
  byStation: (range?: string, limit?: number, scope?: string) =>
    [...fuelKeys.all, 'by-station', range, limit, scope] as const,
  activityTrend: (granularity: FuelTrendGranularity, range?: string, scope?: string) =>
    [...fuelKeys.all, 'activity-trend', granularity, range, scope] as const,
  priceTrend: (range?: string, granularity?: FuelTrendGranularity, scope?: string) =>
    [...fuelKeys.all, 'price-trend', range, granularity, scope] as const,
  typeDistribution: (range?: string, scope?: string) => [...fuelKeys.all, 'type-distribution', range, scope] as const,
  frequencyByVehicle: (range?: string, limit?: number, scope?: string) =>
    [...fuelKeys.all, 'frequency-by-vehicle', range, limit, scope] as const,
  costDistribution: (range?: string, scope?: string) => [...fuelKeys.all, 'cost-distribution', range, scope] as const,
  heatmap: (range?: string, scope?: string) => [...fuelKeys.all, 'heatmap', range, scope] as const,
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

/**
 * Vehicle-Level Analytics: pass `licensePlate` to scope this hook (and
 * every other analytics hook below) to a single vehicle. Omit it for
 * the existing fleet-wide behaviour -- this is the ONLY change needed
 * to turn a fleet chart into a per-vehicle chart, since the underlying
 * component doesn't need to know it's scoped.
 */
export function useFuelStats(dateRange?: DateRange, licensePlate?: string) {
  return useQuery({
    queryKey: fuelKeys.stats(rangeKey(dateRange), licensePlate),
    queryFn: () => fuelApi.getStats(dateRange, licensePlate),
    staleTime: 60_000,
  });
}

export function useFuelKpis(dateRange?: DateRange, licensePlate?: string) {
  return useQuery({
    queryKey: fuelKeys.kpis(rangeKey(dateRange), licensePlate),
    queryFn: () => fuelApi.getKpis(dateRange, licensePlate),
    staleTime: 60_000,
  });
}

export function useAbnormalFuelConsumption(threshold: number = 2, licensePlate?: string) {
  return useQuery({
    queryKey: fuelKeys.abnormal(threshold, licensePlate),
    queryFn: () => fuelApi.getAbnormalConsumption(threshold, licensePlate),
    staleTime: 60_000,
  });
}

export function useMonthlyFuelConsumption(months: number = 12, licensePlate?: string) {
  return useQuery({
    queryKey: fuelKeys.monthly(months, licensePlate),
    queryFn: () => fuelApi.getMonthlyConsumption(months, licensePlate),
    staleTime: 60_000,
  });
}

export function useTopFuelConsumers(limit: number = 5, licensePlate?: string) {
  return useQuery({
    queryKey: fuelKeys.topConsumers(limit, licensePlate),
    queryFn: () => fuelApi.getTopConsumers(limit, licensePlate),
    staleTime: 60_000,
  });
}

export function useFuelByDriver(
  dateRange?: DateRange,
  limit: number = 10,
  sortBy: FuelByDriverSort = 'volume',
  licensePlate?: string
) {
  return useQuery({
    queryKey: fuelKeys.byDriver(rangeKey(dateRange), limit, sortBy, licensePlate),
    queryFn: () => fuelApi.getByDriver(dateRange, limit, sortBy, licensePlate),
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

export function useVehicleFuelHistory(licensePlate: string | undefined, limit: number = 200) {
  return useQuery({
    queryKey: fuelKeys.list({ license_plate: licensePlate, limit }),
    queryFn: () => fuelApi.list({ license_plate: licensePlate, page: 1, limit }),
    enabled: Boolean(licensePlate),
    staleTime: 30_000,
  });
}

// ---- Enterprise analytics (scope-aware) ----

export function useVehicleFuelTimeline(licensePlate: string | undefined, dateRange?: DateRange) {
  return useQuery({
    queryKey: fuelKeys.vehicleTimeline(licensePlate, rangeKey(dateRange)),
    queryFn: () => fuelApi.getVehicleFuelTimeline({ license_plate: licensePlate, ...dateRange }),
    staleTime: 60_000,
  });
}

export function useFuelByStation(dateRange?: DateRange, limit: number = 15, licensePlate?: string) {
  return useQuery({
    queryKey: fuelKeys.byStation(rangeKey(dateRange), limit, licensePlate),
    queryFn: () => fuelApi.getFuelByStation(dateRange, limit, licensePlate),
    staleTime: 60_000,
  });
}

export function useFuelActivityTrend(
  granularity: FuelTrendGranularity,
  dateRange?: DateRange,
  licensePlate?: string
) {
  return useQuery({
    queryKey: fuelKeys.activityTrend(granularity, rangeKey(dateRange), licensePlate),
    queryFn: () => fuelApi.getFuelActivityTrend(granularity, dateRange, licensePlate),
    staleTime: 60_000,
  });
}

export function useAverageFuelPriceTrend(
  dateRange?: DateRange,
  granularity: FuelTrendGranularity = 'month',
  licensePlate?: string
) {
  return useQuery({
    queryKey: fuelKeys.priceTrend(rangeKey(dateRange), granularity, licensePlate),
    queryFn: () => fuelApi.getAverageFuelPriceTrend(dateRange, granularity, licensePlate),
    staleTime: 60_000,
  });
}

export function useFuelTypeDistribution(dateRange?: DateRange, licensePlate?: string) {
  return useQuery({
    queryKey: fuelKeys.typeDistribution(rangeKey(dateRange), licensePlate),
    queryFn: () => fuelApi.getFuelTypeDistribution(dateRange, licensePlate),
    staleTime: 60_000,
  });
}

export function useFuelingFrequencyByVehicle(dateRange?: DateRange, limit: number = 20, licensePlate?: string) {
  return useQuery({
    queryKey: fuelKeys.frequencyByVehicle(rangeKey(dateRange), limit, licensePlate),
    queryFn: () => fuelApi.getFuelingFrequencyByVehicle(dateRange, limit, licensePlate),
    staleTime: 60_000,
  });
}

export function useFuelCostDistribution(dateRange?: DateRange, licensePlate?: string) {
  return useQuery({
    queryKey: fuelKeys.costDistribution(rangeKey(dateRange), licensePlate),
    queryFn: () => fuelApi.getFuelCostDistribution(dateRange, licensePlate),
    staleTime: 60_000,
  });
}

export function useFuelEntryHeatmap(dateRange?: DateRange, licensePlate?: string) {
  return useQuery({
    queryKey: fuelKeys.heatmap(rangeKey(dateRange), licensePlate),
    queryFn: () => fuelApi.getFuelEntryHeatmap(dateRange, licensePlate),
    staleTime: 60_000,
  });
}