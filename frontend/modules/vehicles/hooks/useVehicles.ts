// frontend/modules/vehicles/hooks/useVehicles.ts

import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { vehiclesApi, type VehicleListParams } from '../services/vehicles.api';
import type { Vehicle } from '../types';

export const vehicleKeys = {
  all: ['vehicles'] as const,
  lists: () => [...vehicleKeys.all, 'list'] as const,
  list: (params: Partial<VehicleListParams>) => [...vehicleKeys.lists(), params] as const,
  details: () => [...vehicleKeys.all, 'detail'] as const,
  detail: (id: string) => [...vehicleKeys.details(), id] as const,
  stats: () => [...vehicleKeys.all, 'stats'] as const,
  dueForService: (threshold: number) => [...vehicleKeys.all, 'due-for-service', threshold] as const,
  analytics: (start: string, end: string) => [...vehicleKeys.all, 'analytics', start, end] as const,
  activity: (id: string, page: number) => [...vehicleKeys.all, 'activity', id, page] as const,
};

export function useVehiclesList(params: Partial<VehicleListParams>) {
  return useQuery({
    queryKey: vehicleKeys.list(params),
    queryFn: () => vehiclesApi.list(params),
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  });
}

export function useVehicle(id: string | undefined, options?: Partial<UseQueryOptions<Vehicle>>) {
  return useQuery({
    queryKey: vehicleKeys.detail(id ?? ''),
    queryFn: () => vehiclesApi.getById(id as string),
    enabled: Boolean(id),
    staleTime: 30_000,
    ...options,
  });
}

export function useVehicleStats() {
  return useQuery({
    queryKey: vehicleKeys.stats(),
    queryFn: () => vehiclesApi.getStats(),
    staleTime: 60_000,
  });
}

export function useVehiclesDueForService(threshold = 10000) {
  return useQuery({
    queryKey: vehicleKeys.dueForService(threshold),
    queryFn: () => vehiclesApi.getDueForService(threshold),
    staleTime: 60_000,
  });
}

export function useVehicleAnalytics(startDate: Date, endDate: Date) {
  return useQuery({
    queryKey: vehicleKeys.analytics(startDate.toISOString(), endDate.toISOString()),
    queryFn: () => vehiclesApi.getAnalytics(startDate, endDate),
    staleTime: 5 * 60_000,
  });
}

export function useVehicleActivity(vehicleId: string | undefined, page = 1) {
  return useQuery({
    queryKey: vehicleKeys.activity(vehicleId ?? '', page),
    queryFn: () => vehiclesApi.getActivity(vehicleId as string, page),
    enabled: Boolean(vehicleId),
    staleTime: 30_000,
  });
}