// frontend/modules/inventory/services/index.ts

import { apiClient } from '@/shared/utils/api-client.utils';
import { normalizeListResponse } from '@/shared/utils/pagination.utils';
import type { PaginatedResponse } from '@/shared/types/common.types';
import type { SparePart, SparePartListParams } from '../types';

const BASE = '/api/inventory';

/**
 * Spare parts, read-only.
 *
 * `GET /api/inventory` is wrapped in `withAuth({permission:
 * INVENTORY_VIEW})` and resolves the tenant from the session, so this
 * client sends no tenantId and could not widen its own scope if it
 * tried.
 *
 * Only the two reads the workshop path needs are here. The write verbs
 * on `/api/inventory/*` (create, receive, adjust, consume) are
 * deliberately absent: stock is moved through the WORK ORDER
 * (`POST /api/workorders/[id]/parts`), which is the single writer of
 * consumption movements and the only path that also recalculates the
 * job's partsCost. A second way to decrement stock from the UI would be
 * a way to have the two disagree.
 */
export const sparePartsApi = {
  async list(params: SparePartListParams = {}): Promise<PaginatedResponse<SparePart>> {
    const response = await apiClient.get<SparePart[] | PaginatedResponse<SparePart>>(BASE, {
      params: {
        ...(params.search ? { search: params.search } : {}),
        ...(params.category ? { category: params.category } : {}),
        ...(params.belowReorderThreshold ? { belowReorderThreshold: 'true' } : {}),
        page: params.page ?? 1,
        limit: params.limit ?? 50,
      },
    });
    return normalizeListResponse<SparePart>(response);
  },

  async get(id: string): Promise<SparePart> {
    return apiClient.get<SparePart>(`${BASE}/${id}`);
  },
};

export default sparePartsApi;
