// frontend/modules/fuel/hooks/useFuelMutations.ts

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { fuelApi } from '../services/fuel.api';
import { fuelKeys } from './useFuel';
import type { FuelFormOutput } from '../schemas';
import type { FuelImportResponse } from '../services/fuel.api';

function errMsg(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function useCreateFuelLog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: FuelFormOutput) => fuelApi.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: fuelKeys.all });
      toast.success('Fuel entry logged');
    },
    onError: (error) => toast.error(errMsg(error, 'Failed to log fuel entry')),
  });
}

export function useUpdateFuelLog(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Partial<FuelFormOutput>) => fuelApi.update(id, payload),
    onSuccess: (log) => {
      queryClient.setQueryData(fuelKeys.detail(id), log);
      queryClient.invalidateQueries({ queryKey: fuelKeys.lists() });
      queryClient.invalidateQueries({ queryKey: fuelKeys.all });
      toast.success('Fuel entry updated');
    },
    onError: (error) => toast.error(errMsg(error, 'Failed to update fuel entry')),
  });
}

export function useDeleteFuelLog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, soft = true }: { id: string; soft?: boolean }) => fuelApi.remove(id, soft),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: fuelKeys.all });
      toast.success('Fuel entry deleted');
    },
    onError: (error) => toast.error(errMsg(error, 'Failed to delete fuel entry')),
  });
}

export function useBulkDeleteFuelLogs() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(ids.map((id) => fuelApi.remove(id, true)));
    },
    onSuccess: (_data, ids) => {
      queryClient.invalidateQueries({ queryKey: fuelKeys.all });
      toast.success(`${ids.length} fuel entr${ids.length === 1 ? 'y' : 'ies'} deleted`);
    },
    onError: (error) => toast.error(errMsg(error, 'Failed to delete selected fuel entries')),
  });
}

export function useUploadReceipt() {
  return useMutation({
    mutationFn: (file: File) => fuelApi.uploadReceipt(file),
    onError: (error) => toast.error(errMsg(error, 'Failed to upload receipt')),
  });
}

// NEW: drives FuelImportModal. Backend processes rows sequentially and
// never aborts the batch on a single row failure, so success here can
// still mean "some rows failed" — surface summary.failed accordingly.
export function useImportFuelLogs() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (records: Record<string, unknown>[]) => fuelApi.importLogs(records),
    onSuccess: (data: FuelImportResponse) => {
      queryClient.invalidateQueries({ queryKey: fuelKeys.all });
      const { total, succeeded, duplicates, failed } = data.summary;
      if (failed === 0 && duplicates === 0) {
        toast.success(`Imported ${succeeded} of ${total} fuel logs`);
      } else if (succeeded === 0 && duplicates === total) {
        toast.warning(`All ${total} rows were already imported -- nothing new to add`);
      } else if (succeeded === 0) {
        toast.error(`Import failed for all ${total} rows`);
      } else {
        const parts = [`Imported ${succeeded} of ${total}`];
        if (duplicates > 0) parts.push(`${duplicates} duplicate${duplicates === 1 ? '' : 's'} skipped`);
        if (failed > 0) parts.push(`${failed} failed`);
        toast.warning(parts.join(' -- '));
      }
    },
    onError: (error) => toast.error(errMsg(error, 'Failed to import fuel logs')),
  });
}