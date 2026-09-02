// frontend/modules/vehicles/hooks/useVehicleMutations.ts

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { vehiclesApi } from '../services/vehicles.api';
import { vehicleKeys } from './useVehicles';
import type { Vehicle, VehicleWithAssignment, AssignVehicleDriverPayload } from '../types';
import type { VehicleFormValues } from '../schemas';

function errMsg(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function useCreateVehicle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: VehicleFormValues) => vehiclesApi.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: vehicleKeys.lists() });
      queryClient.invalidateQueries({ queryKey: vehicleKeys.stats() });
      toast.success('Vehicle created');
    },
    onError: (error) => toast.error(errMsg(error, 'Failed to create vehicle')),
  });
}

export function useUpdateVehicle(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Partial<VehicleFormValues>) => vehiclesApi.update(id, payload),
    onSuccess: (vehicle) => {
      queryClient.setQueryData(vehicleKeys.detail(id), vehicle);
      queryClient.invalidateQueries({ queryKey: vehicleKeys.lists() });
      toast.success('Vehicle updated');
    },
    onError: (error) => toast.error(errMsg(error, 'Failed to update vehicle')),
  });
}

export function useDeleteVehicle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, soft = true }: { id: string; soft?: boolean }) => vehiclesApi.remove(id, soft),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: vehicleKeys.lists() });
      queryClient.invalidateQueries({ queryKey: vehicleKeys.stats() });
      toast.success('Vehicle deleted');
    },
    onError: (error) => toast.error(errMsg(error, 'Failed to delete vehicle')),
  });
}

export function useBulkDeleteVehicles() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(ids.map((id) => vehiclesApi.remove(id, true)));
    },
    onSuccess: (_data, ids) => {
      queryClient.invalidateQueries({ queryKey: vehicleKeys.lists() });
      queryClient.invalidateQueries({ queryKey: vehicleKeys.stats() });
      toast.success(`${ids.length} vehicle${ids.length === 1 ? '' : 's'} deleted`);
    },
    onError: (error) => toast.error(errMsg(error, 'Failed to delete selected vehicles')),
  });
}

export function useUpdateVehicleStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: Vehicle['status'] }) =>
      vehiclesApi.updateStatus(id, status),
    onSuccess: (vehicle) => {
      if (vehicle._id) queryClient.setQueryData(vehicleKeys.detail(vehicle._id), vehicle);
      queryClient.invalidateQueries({ queryKey: vehicleKeys.lists() });
      queryClient.invalidateQueries({ queryKey: vehicleKeys.stats() });
      toast.success('Status updated');
    },
    onError: (error) => toast.error(errMsg(error, 'Failed to update status')),
  });
}

/**
 * PENDING BACKEND -- see docs/DRIVER_VEHICLE_ASSIGNMENT_MISSING_BACKEND.md.
 * Calls vehiclesApi.assignDriver(), which hits a route that does not
 * exist yet (PATCH /api/vehicles/:id/driver). Until that route ships,
 * this mutation will genuinely fail and surface the real error through
 * the toast below -- it does not fake success or write local-only state.
 */
export function useAssignVehicleDriver(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: AssignVehicleDriverPayload) => vehiclesApi.assignDriver(id, payload),
    onSuccess: (vehicle: VehicleWithAssignment, payload) => {
      queryClient.setQueryData(vehicleKeys.detail(id), vehicle);
      queryClient.invalidateQueries({ queryKey: vehicleKeys.lists() });
      toast.success(payload.driverId ? 'Driver assigned' : 'Driver unassigned');
    },
    onError: (error) =>
      toast.error(
        errMsg(
          error,
          'Failed to update driver assignment -- this endpoint may not be deployed yet'
        )
      ),
  });
}