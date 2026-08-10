// frontend/modules/workorders/services/workorders.api.ts
//
// Path-based REST wrapper matching the actual route contract exposed
// by app/api/workorders/**: GET/POST /api/workorders, GET
// /api/workorders/[id], POST /api/workorders/[id]/assign, PUT
// /api/workorders/[id]/status, POST /api/workorders/[id]/parts, POST
// /api/workorders/[id]/labor. This mirrors drivers.api.ts's
// `${BASE}/${id}` convention (not maintenance.api.ts's ?id=
// query-dispatch convention -- workorders never used that pattern on
// the backend, so a `${BASE}/${id}` style client is the one that
// actually matches app/api/workorders/[id]/route.ts et al).
//
// Every workorder API route is wrapped in withAuth(...) server-side
// (see app/api/workorders/route.ts and its siblings), so tenant
// scoping and org-unit scoping (module-scope.registry.ts:
// workorders -> level 'org-unit', orgUnitSource 'vehicle') are
// enforced entirely on the server from the session -- this client
// never sends or needs a tenantId/orgUnitId itself.

import { apiClient } from '@/shared/utils/api-client.utils';
import { normalizeListResponse } from '@/shared/utils/pagination.utils';
import type { PaginatedResponse } from '@/shared/types/common.types';
import type {
  WorkOrder,
  WorkOrderCreateDTO,
  WorkOrderListParams,
  AssignMechanicPayload,
  ChangeWorkOrderStatusPayload,
} from '../types';

const BASE = '/api/workorders';

export const workOrdersApi = {
  /**
   * Paginated list. Also the endpoint the list page uses to resolve a
   * `?license_plate=` deep link (from the Command Centre / DVIR
   * notification) into the work order(s) for that vehicle.
   */
  async list(params: Partial<WorkOrderListParams> = {}): Promise<PaginatedResponse<WorkOrder>> {
    const response = await apiClient.get<WorkOrder[] | PaginatedResponse<WorkOrder>>(BASE, {
      params: {
        license_plate: params.license_plate,
        status: params.status,
        priority: params.priority,
        assignedMechanicId: params.assignedMechanicId,
        page: params.page,
        limit: params.limit,
      },
    });
    return normalizeListResponse(response);
  },

  async getById(id: string): Promise<WorkOrder> {
    return apiClient.get<WorkOrder>(`${BASE}/${id}`);
  },

  async create(payload: WorkOrderCreateDTO): Promise<WorkOrder> {
    return apiClient.post<WorkOrder>(BASE, payload);
  },

  async assign(id: string, payload: AssignMechanicPayload): Promise<WorkOrder> {
    return apiClient.post<WorkOrder>(`${BASE}/${id}/assign`, payload);
  },

  async changeStatus(id: string, payload: ChangeWorkOrderStatusPayload): Promise<WorkOrder> {
    return apiClient.put<WorkOrder>(`${BASE}/${id}/status`, payload);
  },

  async consumeParts(id: string, sparePartId: string, quantity: number): Promise<WorkOrder> {
    return apiClient.post<WorkOrder>(`${BASE}/${id}/parts`, { sparePartId, quantity });
  },

  async recordLabor(id: string, laborHours: number, hourlyRate: number): Promise<WorkOrder> {
    return apiClient.post<WorkOrder>(`${BASE}/${id}/labor`, { laborHours, hourlyRate });
  },
};

export default workOrdersApi;