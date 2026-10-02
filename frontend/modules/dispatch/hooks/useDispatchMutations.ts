// frontend/modules/dispatch/hooks/useDispatchMutations.ts

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { dispatchApi } from '../services/dispatch.api';
import { dispatchKeys } from './useDispatch';
import type {
  AssignDispatchPayload,
  ChangeDispatchStatusPayload,
  DispatchJobCreateDTO,
  LinkTripPayload,
} from '../types';

function errMsg(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function useCreateDispatchJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: DispatchJobCreateDTO) => dispatchApi.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dispatchKeys.all });
      toast.success('Dispatch job created');
    },
    onError: (error) => toast.error(errMsg(error, 'Failed to create dispatch job')),
  });
}

export function useAssignDispatchJob(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: AssignDispatchPayload) => dispatchApi.assign(id, payload),
    onSuccess: (job) => {
      queryClient.setQueryData(dispatchKeys.detail(id), job);
      queryClient.invalidateQueries({ queryKey: dispatchKeys.lists() });
      queryClient.invalidateQueries({ queryKey: dispatchKeys.board() });
      toast.success('Vehicle and driver assigned');
    },
    onError: (error) => toast.error(errMsg(error, 'Failed to assign vehicle and driver')),
  });
}

export function useChangeDispatchStatus(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ChangeDispatchStatusPayload) => dispatchApi.changeStatus(id, payload),
    onSuccess: (job) => {
      queryClient.setQueryData(dispatchKeys.detail(id), job);
      queryClient.invalidateQueries({ queryKey: dispatchKeys.lists() });
      queryClient.invalidateQueries({ queryKey: dispatchKeys.board() });
      toast.success(`Dispatch job marked as ${job.status.replace('_', ' ')}`);
    },
    onError: (error) => toast.error(errMsg(error, 'Failed to update dispatch job status')),
  });
}

/** TRIP -> DISPATCH direction. See DispatchService.linkExistingTrip's doc comment for what this does and does not change. */
export function useLinkDispatchTrip(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: LinkTripPayload) => dispatchApi.linkTrip(id, payload),
    onSuccess: (job) => {
      queryClient.setQueryData(dispatchKeys.detail(id), job);
      queryClient.invalidateQueries({ queryKey: dispatchKeys.lists() });
      queryClient.invalidateQueries({ queryKey: dispatchKeys.board() });
      queryClient.invalidateQueries({ queryKey: dispatchKeys.cost(id) });
      toast.success('Trip linked to dispatch job');
    },
    onError: (error) => toast.error(errMsg(error, 'Failed to link trip')),
  });
}
