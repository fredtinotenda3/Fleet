// frontend/modules/transport-cost/services/transport-cost.api.ts
//
// Phase O1 client: two import endpoints (one per sheet family -- see
// the backend command's header for why they are not merged into one)
// and one read endpoint for verifying an import landed correctly.

import { apiClient } from '@/shared/utils/api-client.utils';
import type { PaginatedResponse } from '@/shared/types/common.types';
import type {
  TransportCostSourceRecord,
  TransportCostSheetFamily,
} from '@/shared/types/transport-cost.types';
import type { ImportResponse } from '@/frontend/shared/import/ImportModal';

const BASE = '/api/transport-cost';

export interface TransportCostSourceRecordListParams {
  sheetFamily?: TransportCostSheetFamily;
  importBatchId?: string;
  registration?: string;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  limit?: number;
}

function toIso(value: Date | undefined): string | undefined {
  return value ? value.toISOString() : undefined;
}

export const transportCostApi = {
  /** POST /api/transport-cost/import/third-party */
  async importThirdParty(rows: Array<Record<string, unknown>>, sourceFileName: string): Promise<ImportResponse> {
    return apiClient.post<ImportResponse>(`${BASE}/import/third-party`, { rows, sourceFileName });
  },

  /** POST /api/transport-cost/import/vansales */
  async importVansales(rows: Array<Record<string, unknown>>, sourceFileName: string): Promise<ImportResponse> {
    return apiClient.post<ImportResponse>(`${BASE}/import/vansales`, { rows, sourceFileName });
  },

  /** GET /api/transport-cost/source-records -- verification/review listing only. */
  async listSourceRecords(
    params: TransportCostSourceRecordListParams = {}
  ): Promise<PaginatedResponse<TransportCostSourceRecord>> {
    return apiClient.get<PaginatedResponse<TransportCostSourceRecord>>(`${BASE}/source-records`, {
      params: {
        sheetFamily: params.sheetFamily,
        importBatchId: params.importBatchId,
        registration: params.registration,
        startDate: toIso(params.startDate),
        endDate: toIso(params.endDate),
        page: params.page,
        limit: params.limit,
      },
    });
  },
};

export default transportCostApi;
