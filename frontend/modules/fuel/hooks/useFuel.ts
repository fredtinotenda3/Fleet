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
  stats: (range?: string) => [...fuelKeys.all, 'stats', range] as const,
  kpis: (range?: string) => [...fuelKeys.all, 'kpis', range] as const,
  abnormal: (threshold: number) => [...fuelKeys.all, 'abnormal', threshold] as const,
  monthly: (months: number) => [...fuelKeys.all, 'monthly', months] as const,
  topConsumers: (limit: number) => [...fuelKeys.all, 'top-consumers', limit] as const,
  byDriver: (range?: string, limit?: number, sortBy?: FuelByDriverSort) =>
    [...fuelKeys.all, 'by-driver', range, limit, sortBy] as const,
  vehicleTimeline: (plate?: string, range?: string) =>
    [...fuelKeys.all, 'vehicle-timeline', plate, range] as const,
  byStation: (range?: string, limit?: number) => [...fuelKeys.all, 'by-station', range, limit] as const,
  activityTrend: (granularity: FuelTrendGranularity, range?: string) =>
    [...fuelKeys.all, 'activity-trend', granularity, range] as const,
  priceTrend: (range?: string, granularity?: FuelTrendGranularity) =>
    [...fuelKeys.all, 'price-trend', range, granularity] as const,
  typeDistribution: (range?: string) => [...fuelKeys.all, 'type-distribution', range] as const,
  frequencyByVehicle: (range?: string, limit?: number) =>
    [...fuelKeys.all, 'frequency-by-vehicle', range, limit] as const,
  costDistribution: (range?: string) => [...fuelKeys.all, 'cost-distribution', range] as const,
  heatmap: (range?: string) => [...fuelKeys.all, 'heatmap', range] as const,
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

export function useFuelStats(dateRange?: DateRange) {
  return useQuery({
    queryKey: fuelKeys.stats(rangeKey(dateRange)),
    queryFn: () => fuelApi.getStats(dateRange),
    staleTime: 60_000,
  });
}

export function useFuelKpis(dateRange?: DateRange) {
  return useQuery({
    queryKey: fuelKeys.kpis(rangeKey(dateRange)),
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

export function useFuelByDriver(
  dateRange?: DateRange,
  limit: number = 10,
  sortBy: FuelByDriverSort = 'volume'
) {
  return useQuery({
    queryKey: fuelKeys.byDriver(rangeKey(dateRange), limit, sortBy),
    queryFn: () => fuelApi.getByDriver(dateRange, limit, sortBy),
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

// ---- Enterprise analytics ----

/** #1 Vehicle Fuel Activity Timeline. Omit `license_plate` for "All Vehicles". */
export function useVehicleFuelTimeline(licensePlate: string | undefined, dateRange?: DateRange) {
  return useQuery({
    queryKey: fuelKeys.vehicleTimeline(licensePlate, rangeKey(dateRange)),
    queryFn: () => fuelApi.getVehicleFuelTimeline({ license_plate: licensePlate, ...dateRange }),
    staleTime: 60_000,
  });
}

/** #4 Fuel Spend by Station + #8 Top Fuel Stations share this hook/query. */
export function useFuelByStation(dateRange?: DateRange, limit: number = 15) {
  return useQuery({
    queryKey: fuelKeys.byStation(rangeKey(dateRange), limit),
    queryFn: () => fuelApi.getFuelByStation(dateRange, limit),
    staleTime: 60_000,
  });
}

/** #3 Fuel Activity Trend (combined bar + line) */
export function useFuelActivityTrend(granularity: FuelTrendGranularity, dateRange?: DateRange) {
  return useQuery({
    queryKey: fuelKeys.activityTrend(granularity, rangeKey(dateRange)),
    queryFn: () => fuelApi.getFuelActivityTrend(granularity, dateRange),
    staleTime: 60_000,
  });
}

/** #5 Average Fuel Price Trend */
export function useAverageFuelPriceTrend(dateRange?: DateRange, granularity: FuelTrendGranularity = 'month') {
  return useQuery({
    queryKey: fuelKeys.priceTrend(rangeKey(dateRange), granularity),
    queryFn: () => fuelApi.getAverageFuelPriceTrend(dateRange, granularity),
    staleTime: 60_000,
  });
}

/** #6 Fuel Type Distribution */
export function useFuelTypeDistribution(dateRange?: DateRange) {
  return useQuery({
    queryKey: fuelKeys.typeDistribution(rangeKey(dateRange)),
    queryFn: () => fuelApi.getFuelTypeDistribution(dateRange),
    staleTime: 60_000,
  });
}

/** #7 Fueling Frequency by Vehicle */
export function useFuelingFrequencyByVehicle(dateRange?: DateRange, limit: number = 20) {
  return useQuery({
    queryKey: fuelKeys.frequencyByVehicle(rangeKey(dateRange), limit),
    queryFn: () => fuelApi.getFuelingFrequencyByVehicle(dateRange, limit),
    staleTime: 60_000,
  });
}

/** #9 Fuel Cost Distribution (histogram) */
export function useFuelCostDistribution(dateRange?: DateRange) {
  return useQuery({
    queryKey: fuelKeys.costDistribution(rangeKey(dateRange)),
    queryFn: () => fuelApi.getFuelCostDistribution(dateRange),
    staleTime: 60_000,
  });
}

/** #10 Fuel Entry Heatmap */
export function useFuelEntryHeatmap(dateRange?: DateRange) {
  return useQuery({
    queryKey: fuelKeys.heatmap(rangeKey(dateRange)),
    queryFn: () => fuelApi.getFuelEntryHeatmap(dateRange),
    staleTime: 60_000,
  });
}