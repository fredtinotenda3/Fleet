// frontend/modules/fuel-stations/hooks/useFuelStationMutations.ts

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { fuelStationsApi } from '../services/fuel-stations.api';
import { fuelStationKeys } from './useFuelStations';
import type { FuelStationFormValues } from '../schemas';

function errMsg(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function useCreateFuelStation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: FuelStationFormValues) => fuelStationsApi.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: fuelStationKeys.all });
      toast.success('Fuel station added');
    },
    onError: (error) => toast.error(errMsg(error, 'Failed to add fuel station')),
  });
}

export function useUpdateFuelStation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Partial<FuelStationFormValues>) => fuelStationsApi.update(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: fuelStationKeys.all });
      toast.success('Fuel station updated');
    },
    onError: (error) => toast.error(errMsg(error, 'Failed to update fuel station')),
  });
}

export function useDeleteFuelStation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, soft = true }: { id: string; soft?: boolean }) => fuelStationsApi.remove(id, soft),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: fuelStationKeys.all });
      toast.success('Fuel station deleted');
    },
    onError: (error) => toast.error(errMsg(error, 'Failed to delete fuel station')),
  });
}