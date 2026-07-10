// frontend/modules/fuel-cards/hooks/useFuelCards.ts

import { useQuery } from '@tanstack/react-query';
import { fuelCardsApi, type FuelCardListParams } from '../services/fuel-cards.api';

export const fuelCardKeys = {
  all: ['fuel-cards'] as const,
  lists: () => [...fuelCardKeys.all, 'list'] as const,
  list: (params: Partial<FuelCardListParams>) => [...fuelCardKeys.lists(), params] as const,
  detail: (id: string) => [...fuelCardKeys.all, 'detail', id] as const,
};

export function useFuelCardsList(params: Partial<FuelCardListParams> = {}) {
  return useQuery({
    queryKey: fuelCardKeys.list(params),
    queryFn: () => fuelCardsApi.list(params),
    staleTime: 60_000,
  });
}

export function useFuelCard(id: string | undefined) {
  return useQuery({
    queryKey: fuelCardKeys.detail(id ?? ''),
    queryFn: () => fuelCardsApi.getById(id as string),
    enabled: Boolean(id),
    staleTime: 60_000,
  });
}