// frontend/modules/workorders/hooks/useWorkOrders.ts

import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { workOrdersApi } from '../services/workorders.api';
import { mechanicsApi } from '../services/mechanics.api';
import { baysApi } from '../services/bays.api';
import type { WorkOrder, WorkOrderListParams } from '../types';

export const workOrderKeys = {
  all: ['workorders'] as const,
  lists: () => [...workOrderKeys.all, 'list'] as const,
  list: (params: Partial<WorkOrderListParams>) => [...workOrderKeys.lists(), params] as const,
  details: () => [...workOrderKeys.all, 'detail'] as const,
  detail: (id: string) => [...workOrderKeys.details(), id] as const,
};

export function useWorkOrderList(params: Partial<WorkOrderListParams>) {
  return useQuery({
    queryKey: workOrderKeys.list(params),
    queryFn: () => workOrdersApi.list(params),
    placeholderData: (prev) => prev,
    staleTime: 15_000,
  });
}

export function useWorkOrder(id: string | undefined, options?: Partial<UseQueryOptions<WorkOrder>>) {
  return useQuery({
    queryKey: workOrderKeys.detail(id ?? ''),
    queryFn: () => workOrdersApi.getById(id as string),
    enabled: Boolean(id),
    staleTime: 15_000,
    ...options,
  });
}

/**
 * Fetches the org's member roster for the assign-mechanic picker. Kept
 * as its own hook (rather than folded into useWorkOrder) since it's
 * org-scoped, not work-order-scoped, and several places in this module
 * need it (list page bulk actions, detail page, assign dialog).
 */
export function useAssignableMechanics(tenantId: string | undefined) {
  return useQuery({
    queryKey: ['workorders', 'assignable-mechanics', tenantId ?? ''],
    queryFn: () => mechanicsApi.listOrganizationMembers(tenantId as string),
    enabled: Boolean(tenantId),
    staleTime: 60_000,
  });
}

/** Bays offered on the assign-mechanic form's optional bay picker. 'available' only -- an occupied/closed bay isn't a sensible destination for a new assignment. */
export function useAvailableBays() {
  return useQuery({
    queryKey: ['workorders', 'available-bays'],
    queryFn: () => baysApi.list('available'),
    staleTime: 30_000,
    select: (result) => result.data,
  });
}