// frontend/modules/drivers/hooks/useDrivers.ts

import { useQuery } from '@tanstack/react-query';
import { driversApi, type DriverListParams } from '../services/drivers.api';

export const driverKeys = {
  all: ['drivers'] as const,
  lists: () => [...driverKeys.all, 'list'] as const,
  list: (params: Partial<DriverListParams>) => [...driverKeys.lists(), params] as const,
  detail: (id: string) => [...driverKeys.all, 'detail', id] as const,
};

/**
 * `useDriversList` (not `useDrivers`) to match the call sites already
 * shipped in FuelForm/FuelFilters:
 *   useDriversList({ limit: 1000 })
 *   useDriversList({ status: 'active', limit: 1000 })
 */
export function useDriversList(params: Partial<DriverListParams> = {}) {
  return useQuery({
    queryKey: driverKeys.list(params),
    queryFn: () => driversApi.list(params),
    staleTime: 60_000,
  });
}

export function useDriver(id: string | undefined) {
  return useQuery({
    queryKey: driverKeys.detail(id ?? ''),
    queryFn: () => driversApi.getById(id as string),
    enabled: Boolean(id),
    staleTime: 60_000,
  });
}