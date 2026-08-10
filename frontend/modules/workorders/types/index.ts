// frontend/modules/workorders/types/index.ts
//
// There is no separate shared/types/workorder.types.ts client mirror
// (unlike drivers/vehicles), so -- same pattern as bays.api.ts already
// uses for workshop types -- this imports the backend module's types
// directly, plus its additive tenancy/DVIR augmentations, and layers a
// few frontend-only helpers (list params, action payloads, status
// labels/order, and a client-side mirror of the backend's valid status
// transitions) on top.

import type {
  WorkOrder,
  WorkOrderCreateDTO,
  WorkOrderFilters,
  WorkOrderStatus,
  WorkOrderPartUsage,
} from '@/modules/workorders/types/workorder.types';
import '@/modules/workorders/types/workorder.tenancy-addendum';
import '@/modules/workorders/types/workorder.dvir-addendum';
import type { Priority, PaginatedResponse } from '@/shared/types/common.types';

export type {
  WorkOrder,
  WorkOrderCreateDTO,
  WorkOrderFilters,
  WorkOrderStatus,
  WorkOrderPartUsage,
  Priority,
  PaginatedResponse,
};

/** WorkOrderFilters plus the pagination params the list endpoint accepts (see workorders.api.ts's list()). */
export interface WorkOrderListParams extends WorkOrderFilters {
  page?: number;
  limit?: number;
}

/** Body accepted by POST /api/workorders/[id]/assign (workorder.controller.ts's assign()). */
export interface AssignMechanicPayload {
  mechanicId: string;
  bayId?: string;
}

/** Body accepted by PUT /api/workorders/[id]/status. reason is only meaningful for a cancellation. */
export interface ChangeWorkOrderStatusPayload {
  status: WorkOrderStatus;
  reason?: string;
}

export const WORK_ORDER_STATUSES: WorkOrderStatus[] = [
  'open',
  'assigned',
  'in_progress',
  'on_hold',
  'completed',
  'cancelled',
];

export const WORK_ORDER_STATUS_LABELS: Record<WorkOrderStatus, string> = {
  open: 'Open',
  assigned: 'Assigned',
  in_progress: 'In progress',
  on_hold: 'On hold',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

/** Mirrors VALID_TRANSITIONS in modules/workorders/services/workorder.service.ts -- keep in sync with the backend. */
export const WORK_ORDER_VALID_TRANSITIONS: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  open: ['assigned', 'cancelled'],
  assigned: ['in_progress', 'on_hold', 'cancelled'],
  in_progress: ['on_hold', 'completed', 'cancelled'],
  on_hold: ['in_progress', 'cancelled'],
  completed: [],
  cancelled: [],
};
