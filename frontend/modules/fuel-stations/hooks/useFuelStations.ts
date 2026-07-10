// frontend/modules/fuel-stations/hooks/useFuelStations.ts

import { useQuery } from '@tanstack/react-query';
import { fuelStationsApi, type FuelStationListParams } from '../services/fuel-stations.api';

export const fuelStationKeys = {
  all: ['fuel-stations'] as const,
  lists: () => [...fuelStationKeys.all, 'list'] as const,
  list: (params: Partial<FuelStationListParams>) => [...fuelStationKeys.lists(), params] as const,
  detail: (id: string) => [...fuelStationKeys.all, 'detail', id] as const,
};

export function useFuelStationsList(params: Partial<FuelStationListParams> = {}) {
  return useQuery({
    queryKey: fuelStationKeys.list(params),
    queryFn: () => fuelStationsApi.list(params),
    staleTime: 60_000,
  });
}

export function useFuelStation(id: string | undefined) {
  return useQuery({
    queryKey: fuelStationKeys.detail(id ?? ''),
    queryFn: () => fuelStationsApi.getById(id as string),
    enabled: Boolean(id),
    staleTime: 60_000,
  });
}