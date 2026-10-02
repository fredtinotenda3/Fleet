// frontend/modules/dispatch/services/dispatch.api.ts
//
// Path-based REST wrapper matching the actual route contract exposed by
// app/api/dispatch/**: GET/POST /api/dispatch, GET /api/dispatch/board,
// GET /api/dispatch/[id], POST /api/dispatch/[id]/assign, PUT
// /api/dispatch/[id]/status, POST /api/dispatch/[id]/link-trip, GET
// /api/dispatch/[id]/cost. Mirrors workorders.api.ts's `${BASE}/${id}`
// convention exactly.
//
// Every dispatch API route is wrapped in withAuth(...) server-side (see
// app/api/dispatch/route.ts and its siblings), so tenant scoping and
// org-unit scoping (DispatchService.assertInScope) are enforced
// entirely on the server from the session -- this client never sends
// or needs a tenantId/orgUnitId itself.

import { apiClient } from '@/shared/utils/api-client.utils';
import { normalizeListResponse } from '@/shared/utils/pagination.utils';
import type { PaginatedResponse } from '@/shared/types/common.types';
import type {
  DispatchJob,
  DispatchJobCreateDTO,
  DispatchListParams,
  AssignDispatchPayload,
  ChangeDispatchStatusPayload,
  LinkTripPayload,
  DispatchCostSummary,
} from '../types';

const BASE = '/api/dispatch';

export const dispatchApi = {
  async list(params: Partial<DispatchListParams> = {}): Promise<PaginatedResponse<DispatchJob>> {
    const response = await apiClient.get<DispatchJob[] | PaginatedResponse<DispatchJob>>(BASE, {
      params: {
        status: params.status,
        priority: params.priority,
        assignedDriverId: params.assignedDriverId,
        assignedVehicleId: params.assignedVehicleId,
        page: params.page,
        limit: params.limit,
      },
    });
    return normalizeListResponse(response);
  },

  /** The active board -- every job not yet completed/cancelled, org-unit-scoped. Backs the Dispatch board view. */
  async board(): Promise<DispatchJob[]> {
    return apiClient.get<DispatchJob[]>(`${BASE}/board`);
  },

  async getById(id: string): Promise<DispatchJob> {
    return apiClient.get<DispatchJob>(`${BASE}/${id}`);
  },

  async create(payload: DispatchJobCreateDTO): Promise<DispatchJob> {
    return apiClient.post<DispatchJob>(BASE, payload);
  },

  async assign(id: string, payload: AssignDispatchPayload): Promise<DispatchJob> {
    return apiClient.post<DispatchJob>(`${BASE}/${id}/assign`, payload);
  },

  async changeStatus(id: string, payload: ChangeDispatchStatusPayload): Promise<DispatchJob> {
    return apiClient.put<DispatchJob>(`${BASE}/${id}/status`, payload);
  },

  /** TRIP -> DISPATCH direction: associate an existing, independently-logged trip with this job. */
  async linkTrip(id: string, payload: LinkTripPayload): Promise<DispatchJob> {
    return apiClient.post<DispatchJob>(`${BASE}/${id}/link-trip`, payload);
  },

  /** Honest cost summary -- see DispatchService.getCostSummary's doc comment. Never fabricated. */
  async getCost(id: string): Promise<DispatchCostSummary> {
    return apiClient.get<DispatchCostSummary>(`${BASE}/${id}/cost`);
  },
};

export default dispatchApi;
