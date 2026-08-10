// frontend/modules/workorders/services/bays.api.ts
//
// Thin read-only wrapper around GET /api/workshop/bays, needed for the
// optional bay picker on the assign-mechanic form (WorkOrderService.
// assign() accepts an optional bayId alongside mechanicId). No
// dedicated frontend workshop module exists yet, so this lives here
// rather than introducing a whole new module for one picker -- if a
// workshop module is built later, this can move there and be
// re-exported.

import { apiClient } from '@/shared/utils/api-client.utils';
import { normalizeListResponse } from '@/shared/utils/pagination.utils';
import type { PaginatedResponse } from '@/shared/types/common.types';
import type { WorkshopBay } from '@/modules/workshop/types/workshop.types';
import '@/modules/workshop/types/workshop.tenancy-addendum';

export type { WorkshopBay };

const BASE = '/api/workshop/bays';

export const baysApi = {
  async list(status?: string): Promise<PaginatedResponse<WorkshopBay>> {
    const response = await apiClient.get<WorkshopBay[] | PaginatedResponse<WorkshopBay>>(BASE, {
      params: { status, limit: 200 },
    });
    return normalizeListResponse(response);
  },
};

export default baysApi;