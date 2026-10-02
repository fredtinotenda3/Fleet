// frontend/modules/dispatch/types/index.ts
//
// There is no separate shared/types/dispatch.types.ts client mirror
// (same situation workorders/types/index.ts documents for WorkOrder) --
// this imports the backend module's types directly and layers a few
// frontend-only helpers (list params, action payloads, status
// labels/order, and a client-side mirror of the backend's valid status
// transitions) on top, matching that file's exact convention.

import type {
  DispatchJob,
  DispatchJobCreateDTO,
  DispatchFilters,
  DispatchJobStatus,
} from '@/modules/dispatch/types/dispatch.types';
import type { Priority, PaginatedResponse } from '@/shared/types/common.types';

export type {
  DispatchJob,
  DispatchJobCreateDTO,
  DispatchFilters,
  DispatchJobStatus,
  Priority,
  PaginatedResponse,
};

/** DispatchFilters plus the pagination params GET /api/dispatch accepts (dispatch.controller.ts's list()). */
export interface DispatchListParams extends DispatchFilters {
  page?: number;
  limit?: number;
}

/** Body accepted by POST /api/dispatch/[id]/assign (dispatch.controller.ts's assign()). Both are required -- there is no partial assignment. */
export interface AssignDispatchPayload {
  driverId: string;
  vehicleId: string;
}

/** Body accepted by PUT /api/dispatch/[id]/status. reason is only meaningful for a cancellation. */
export interface ChangeDispatchStatusPayload {
  status: DispatchJobStatus;
  reason?: string;
}

/** Body accepted by POST /api/dispatch/[id]/link-trip (TRIP -> DISPATCH direction; see dispatch.service.ts's linkExistingTrip). */
export interface LinkTripPayload {
  tripId: string;
}

/** Response shape of GET /api/dispatch/[id]/cost (dispatch.service.ts's getCostSummary -- never fabricated, see its doc comment). */
export interface DispatchCostSummary {
  tripId: string | null;
  available: boolean;
  fuelCost: number;
  expenseCost: number;
  totalCost: number;
}

export const DISPATCH_JOB_STATUSES: DispatchJobStatus[] = [
  'unassigned',
  'assigned',
  'en_route',
  'in_progress',
  'completed',
  'cancelled',
];

export const DISPATCH_JOB_STATUS_LABELS: Record<DispatchJobStatus, string> = {
  unassigned: 'Unassigned',
  assigned: 'Assigned',
  en_route: 'En route',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

/** Mirrors VALID_TRANSITIONS in modules/dispatch/services/dispatch.service.ts -- keep in sync with the backend. */
export const DISPATCH_VALID_TRANSITIONS: Record<DispatchJobStatus, DispatchJobStatus[]> = {
  unassigned: ['assigned', 'cancelled'],
  assigned: ['en_route', 'cancelled'],
  en_route: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};
