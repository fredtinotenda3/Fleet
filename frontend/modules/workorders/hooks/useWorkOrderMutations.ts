// frontend/modules/workorders/hooks/useWorkOrderMutations.ts

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { workOrdersApi } from '../services/workorders.api';
import { workOrderKeys } from './useWorkOrders';
import type { AssignMechanicPayload, ChangeWorkOrderStatusPayload, WorkOrderCreateDTO } from '../types';

function errMsg(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function useCreateWorkOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: WorkOrderCreateDTO) => workOrdersApi.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workOrderKeys.all });
      toast.success('Work order created');
    },
    onError: (error) => toast.error(errMsg(error, 'Failed to create work order')),
  });
}

export function useAssignMechanic(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: AssignMechanicPayload) => workOrdersApi.assign(id, payload),
    onSuccess: (workOrder) => {
      queryClient.setQueryData(workOrderKeys.detail(id), workOrder);
      queryClient.invalidateQueries({ queryKey: workOrderKeys.lists() });
      toast.success('Mechanic assigned');
    },
    onError: (error) => toast.error(errMsg(error, 'Failed to assign mechanic')),
  });
}

export function useChangeWorkOrderStatus(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ChangeWorkOrderStatusPayload) => workOrdersApi.changeStatus(id, payload),
    onSuccess: (workOrder) => {
      queryClient.setQueryData(workOrderKeys.detail(id), workOrder);
      queryClient.invalidateQueries({ queryKey: workOrderKeys.lists() });
      toast.success(`Work order marked as ${workOrder.status.replace('_', ' ')}`);
    },
    onError: (error) => toast.error(errMsg(error, 'Failed to update work order status')),
  });
}