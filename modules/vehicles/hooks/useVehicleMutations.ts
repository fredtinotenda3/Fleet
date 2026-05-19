// modules/vehicles/hooks/useVehicleMutations.ts

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { vehiclesApi } from '../api/vehicles.api';
import { VehicleCreateDTO, VehicleUpdateDTO } from '@/shared/types/vehicle.types';
import { queryKeys } from '@/shared/config/react-query';
import { toast } from 'sonner';

export const useCreateVehicle = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: VehicleCreateDTO) => vehiclesApi.createVehicle(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.lists() });
      queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.stats() });
      toast.success('Vehicle created successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create vehicle');
    },
  });
};

export const useUpdateVehicle = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: VehicleUpdateDTO }) =>
      vehiclesApi.updateVehicle(id, data),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.lists() });
      queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.detail(variables.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.stats() });
      toast.success('Vehicle updated successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update vehicle');
    },
  });
};

export const useUpdateVehicleStatus = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: VehicleUpdateDTO['status'] }) =>
      vehiclesApi.updateVehicleStatus(id, status!),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.lists() });
      queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.detail(variables.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.stats() });
      toast.success('Vehicle status updated');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update vehicle status');
    },
  });
};

export const useDeleteVehicle = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, soft = true }: { id: string; soft?: boolean }) =>
      vehiclesApi.deleteVehicle(id, soft),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.lists() });
      queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.stats() });
      toast.success('Vehicle deleted successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete vehicle');
    },
  });
};