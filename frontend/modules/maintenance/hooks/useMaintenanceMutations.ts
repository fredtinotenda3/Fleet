// frontend/modules/maintenance/hooks/useMaintenanceMutations.ts

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { maintenanceApi } from '../services/maintenance.api';
import { maintenanceKeys } from './useMaintenance';
import type { MaintenanceFormOutput } from '../schemas';

function errMsg(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function useCreateMaintenanceRecord() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: MaintenanceFormOutput) => maintenanceApi.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: maintenanceKeys.all });
      toast.success('Maintenance record created');
    },
    onError: (error) => toast.error(errMsg(error, 'Failed to create maintenance record')),
  });
}

export function useUpdateMaintenanceRecord(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Partial<MaintenanceFormOutput>) => maintenanceApi.update(id, payload),
    onSuccess: (record) => {
      queryClient.setQueryData(maintenanceKeys.detail(id), record);
      queryClient.invalidateQueries({ queryKey: maintenanceKeys.lists() });
      queryClient.invalidateQueries({ queryKey: maintenanceKeys.all });
      toast.success('Maintenance record updated');
    },
    onError: (error) => toast.error(errMsg(error, 'Failed to update maintenance record')),
  });
}

export function useDeleteMaintenanceRecord() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => maintenanceApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: maintenanceKeys.all });
      toast.success('Maintenance record deleted');
    },
    onError: (error) => toast.error(errMsg(error, 'Failed to delete maintenance record')),
  });
}

export function useBulkDeleteMaintenanceRecords() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(ids.map((id) => maintenanceApi.remove(id)));
    },
    onSuccess: (_data, ids) => {
      queryClient.invalidateQueries({ queryKey: maintenanceKeys.all });
      toast.success(`${ids.length} record${ids.length === 1 ? '' : 's'} deleted`);
    },
    onError: (error) => toast.error(errMsg(error, 'Failed to delete selected records')),
  });
}

export function useCompleteMaintenanceRecord() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, completionDate }: { id: string; completionDate?: Date }) =>
      maintenanceApi.complete(id, completionDate),
    onSuccess: (record) => {
      queryClient.setQueryData(maintenanceKeys.detail(record._id), record);
      queryClient.invalidateQueries({ queryKey: maintenanceKeys.all });
      toast.success('Marked as completed');
    },
    onError: (error) => toast.error(errMsg(error, 'Failed to complete maintenance record')),
  });
}

export function useRecalculateOverdue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => maintenanceApi.recalculateOverdue(),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: maintenanceKeys.all });
      toast.success(`Refreshed statuses (${result.updatedCount} updated)`);
    },
    onError: (error) => toast.error(errMsg(error, 'Failed to refresh overdue statuses')),
  });
}