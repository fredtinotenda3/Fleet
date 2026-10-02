// frontend/modules/dispatch/hooks/useDispatch.ts

import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { dispatchApi } from '../services/dispatch.api';
import type { DispatchJob, DispatchListParams, DispatchCostSummary } from '../types';

export const dispatchKeys = {
  all: ['dispatch'] as const,
  lists: () => [...dispatchKeys.all, 'list'] as const,
  list: (params: Partial<DispatchListParams>) => [...dispatchKeys.lists(), params] as const,
  board: () => [...dispatchKeys.all, 'board'] as const,
  details: () => [...dispatchKeys.all, 'detail'] as const,
  detail: (id: string) => [...dispatchKeys.details(), id] as const,
  cost: (id: string) => [...dispatchKeys.all, 'cost', id] as const,
};

export function useDispatchList(params: Partial<DispatchListParams>) {
  return useQuery({
    queryKey: dispatchKeys.list(params),
    queryFn: () => dispatchApi.list(params),
    placeholderData: (prev) => prev,
    staleTime: 15_000,
  });
}

/** Active-jobs board (unassigned/assigned/en_route/in_progress), org-unit-scoped server-side. */
export function useDispatchBoard() {
  return useQuery({
    queryKey: dispatchKeys.board(),
    queryFn: () => dispatchApi.board(),
    staleTime: 10_000,
    // Dispatch is a live operational view -- a dispatcher watching the
    // board expects it to move without manually refreshing, the same
    // way the Command Centre feed polls.
    refetchInterval: 30_000,
  });
}

export function useDispatchJob(id: string | undefined, options?: Partial<UseQueryOptions<DispatchJob>>) {
  return useQuery({
    queryKey: dispatchKeys.detail(id ?? ''),
    queryFn: () => dispatchApi.getById(id as string),
    enabled: Boolean(id),
    staleTime: 15_000,
    ...options,
  });
}

/** Honest cost summary -- `available: false` with no trip linked yet, never a fabricated zero-cost claim. */
export function useDispatchCost(id: string | undefined) {
  return useQuery<DispatchCostSummary>({
    queryKey: dispatchKeys.cost(id ?? ''),
    queryFn: () => dispatchApi.getCost(id as string),
    enabled: Boolean(id),
    staleTime: 15_000,
  });
}
