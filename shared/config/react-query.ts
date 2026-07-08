// shared/config/react-query.ts

import { DefaultOptions, QueryClient } from '@tanstack/react-query';

// FIX: staleTime:0 + refetchOnWindowFocus:true + refetchOnMount:true meant
// every single query, on every page, refetched every time you switched
// windows/tabs or mounted a component — even if the data was fetched 2
// seconds ago. Combined with slow backend routes, this created a visible
// "everything reloads constantly" feel. staleTime > 0 means React Query
// will just serve cached data without re-hitting the network within that
// window; refetchOnWindowFocus:false stops the background refetch on
// alt-tab (the classic cause of "why is /api/organizations firing again").
export const defaultQueryOptions: DefaultOptions = {
  queries: {
    staleTime: 60 * 1000, // 1 minute — safe default, override per-query if you need fresher data
    gcTime: 1000 * 60 * 5, // 5 minutes
    retry: 1,
    refetchOnWindowFocus: false,
    refetchOnMount: true, // still fetches if there's no cached data yet, or cache is stale
    refetchOnReconnect: true,
  },
  mutations: {
    retry: 0,
  },
};

export const queryClient = new QueryClient({
  defaultOptions: defaultQueryOptions,
});

export const queryKeys = {
  vehicles: {
    all: ['vehicles'] as const,
    lists: () => [...queryKeys.vehicles.all, 'list'] as const,
    list: (filters: Record<string, unknown>) =>
      [...queryKeys.vehicles.lists(), filters] as const,
    details: () => [...queryKeys.vehicles.all, 'detail'] as const,
    detail: (id: string) =>
      [...queryKeys.vehicles.details(), id] as const,
    stats: () => [...queryKeys.vehicles.all, 'stats'] as const,
    byLicensePlate: (licensePlate: string) =>
      [...queryKeys.vehicles.all, 'licensePlate', licensePlate] as const,
    analytics: (startDate: Date, endDate: Date) =>
      [
        ...queryKeys.vehicles.all,
        'analytics',
        startDate,
        endDate,
      ] as const,
  },
  expenses: {
    all: ['expenses'] as const,
    lists: () => [...queryKeys.expenses.all, 'list'] as const,
    list: (filters: Record<string, unknown>) =>
      [...queryKeys.expenses.lists(), filters] as const,
    details: () => [...queryKeys.expenses.all, 'detail'] as const,
    detail: (id: string) =>
      [...queryKeys.expenses.details(), id] as const,
    stats: () => [...queryKeys.expenses.all, 'stats'] as const,
  },
  fuel: {
    all: ['fuel'] as const,
    lists: () => [...queryKeys.fuel.all, 'list'] as const,
    list: (filters: Record<string, unknown>) =>
      [...queryKeys.fuel.lists(), filters] as const,
    stats: () => [...queryKeys.fuel.all, 'stats'] as const,
  },
  maintenance: {
    all: ['maintenance'] as const,
    lists: () => [...queryKeys.maintenance.all, 'list'] as const,
    list: (filters: Record<string, unknown>) =>
      [...queryKeys.maintenance.lists(), filters] as const,
    stats: () => [...queryKeys.maintenance.all, 'stats'] as const,
  },
  trips: {
    all: ['trips'] as const,
    lists: () => [...queryKeys.trips.all, 'list'] as const,
    list: (filters: Record<string, unknown>) =>
      [...queryKeys.trips.lists(), filters] as const,
    stats: () => [...queryKeys.trips.all, 'stats'] as const,
  },
} as const;

export type QueryKeys = typeof queryKeys;