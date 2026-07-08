// frontend/modules/trips/hooks/useTripMutations.ts

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { tripsApi } from '../services/trips.api';
import { tripKeys } from './useTrips';
import type { TripFormOutput } from '../schemas';

function errMsg(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function useCreateTrip() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: TripFormOutput) => tripsApi.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tripKeys.lists() });
      queryClient.invalidateQueries({ queryKey: tripKeys.stats() });
      toast.success('Trip logged');
    },
    onError: (error) => toast.error(errMsg(error, 'Failed to log trip')),
  });
}

export function useUpdateTrip(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Partial<TripFormOutput>) => tripsApi.update(id, payload),
    onSuccess: (trip) => {
      queryClient.setQueryData(tripKeys.detail(id), trip);
      queryClient.invalidateQueries({ queryKey: tripKeys.lists() });
      queryClient.invalidateQueries({ queryKey: tripKeys.stats() });
      toast.success('Trip updated');
    },
    onError: (error) => toast.error(errMsg(error, 'Failed to update trip')),
  });
}

export function useDeleteTrip() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => tripsApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tripKeys.lists() });
      queryClient.invalidateQueries({ queryKey: tripKeys.stats() });
      toast.success('Trip deleted');
    },
    onError: (error) => toast.error(errMsg(error, 'Failed to delete trip')),
  });
}

export function useBulkDeleteTrips() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(ids.map((id) => tripsApi.remove(id)));
    },
    onSuccess: (_data, ids) => {
      queryClient.invalidateQueries({ queryKey: tripKeys.lists() });
      queryClient.invalidateQueries({ queryKey: tripKeys.stats() });
      toast.success(`${ids.length} trip${ids.length === 1 ? '' : 's'} deleted`);
    },
    onError: (error) => toast.error(errMsg(error, 'Failed to delete selected trips')),
  });
}