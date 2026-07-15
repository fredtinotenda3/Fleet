// frontend/modules/drivers/hooks/useDriverMutations.ts

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { driversApi } from '../services/drivers.api';
import { driverKeys } from './useDrivers';
import type { DriverFormValues } from '../schemas';

function errMsg(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function useCreateDriver() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: DriverFormValues) => driversApi.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: driverKeys.all });
      toast.success('Driver added');
    },
    onError: (error) => toast.error(errMsg(error, 'Failed to add driver')),
  });
}

export function useUpdateDriver(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Partial<DriverFormValues>) => driversApi.update(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: driverKeys.all });
      toast.success('Driver updated');
    },
    onError: (error) => toast.error(errMsg(error, 'Failed to update driver')),
  });
}

export function useDeleteDriver() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, soft = true }: { id: string; soft?: boolean }) => driversApi.remove(id, soft),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: driverKeys.all });
      toast.success('Driver deleted');
    },
    onError: (error) => toast.error(errMsg(error, 'Failed to delete driver')),
  });
}
