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
/**
 * ─────────────────────────────────────────────────────────────────────
 * PARTS AND LABOUR — the workshop dead-end, closed
 * ─────────────────────────────────────────────────────────────────────
 * `POST /api/workorders/[id]/parts` and `.../labor` were live routes,
 * `workOrdersApi.consumeParts` and `.recordLabor` were implemented, and
 * `WorkOrderService` had both methods with inventory movement and cost
 * recalculation behind them. Nothing in the application called any of
 * it — there were no mutation hooks and no UI.
 *
 * The visible consequence was worse than a missing feature: the work
 * order detail page renders a Costs card with Parts, Labor and Total,
 * and those three figures were permanently zero for every work order
 * ever created, because there was no way to make them anything else. A
 * workshop manager could not answer "what did this repair cost", which
 * is the question a work order exists to answer.
 */
export function useConsumeParts(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ sparePartId, quantity }: { sparePartId: string; quantity: number }) =>
      workOrdersApi.consumeParts(id, sparePartId, quantity),
    onSuccess: (workOrder) => {
      queryClient.setQueryData(workOrderKeys.detail(id), workOrder);
      queryClient.invalidateQueries({ queryKey: workOrderKeys.lists() });
      // Stock moved, so the parts catalogue this dialog reads from is
      // now stale — quantityOnHand changed on the part just consumed.
      queryClient.invalidateQueries({ queryKey: ['spare-parts'] });
      toast.success('Parts recorded');
    },
    onError: (error) => toast.error(errMsg(error, 'Failed to record parts')),
  });
}

export function useRecordLabor(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ laborHours, hourlyRate }: { laborHours: number; hourlyRate: number }) =>
      workOrdersApi.recordLabor(id, laborHours, hourlyRate),
    onSuccess: (workOrder) => {
      queryClient.setQueryData(workOrderKeys.detail(id), workOrder);
      queryClient.invalidateQueries({ queryKey: workOrderKeys.lists() });
      toast.success('Labour recorded');
    },
    onError: (error) => toast.error(errMsg(error, 'Failed to record labour')),
  });
}
