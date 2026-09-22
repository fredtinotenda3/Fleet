// frontend/modules/transport-cost/services/transport-cost.api.ts
//
// Phase O1 client: two import endpoints (one per sheet family -- see
// the backend command's header for why they are not merged into one)
// and one read endpoint for verifying an import landed correctly.
// Phase O4 adds the three read-only report endpoints (GET-only, never
// posts anything -- posting stays behind TRANSPORT_COST_IMPORT/
// FINANCE_MANAGE on the import page, not this one).

import { apiClient } from '@/shared/utils/api-client.utils';
import { downloadBlob } from '@/shared/utils/file-download.utils';
import type { PaginatedResponse } from '@/shared/types/common.types';
import type {
  TransportCostSourceRecord,
  TransportCostSheetFamily,
} from '@/shared/types/transport-cost.types';
import type { ImportResponse } from '@/frontend/shared/import/ImportModal';
import type { TransportCostAllocationReport, PostingDrillDown, DataQualityExceptionsReport } from '../types';

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

  /** GET /api/transport-cost/report -- Phase O4: Business Stream -> Vehicle totals for a period. */
  async getAllocationReport(periodStart: Date, periodEnd: Date): Promise<TransportCostAllocationReport> {
    return apiClient.get<TransportCostAllocationReport>(`${BASE}/report`, {
      params: { periodStart: periodStart.toISOString(), periodEnd: periodEnd.toISOString() },
    });
  },

  /** GET /api/transport-cost/report/months -- Phase O4: the month picker's own data source. */
  async getAvailableMonths(): Promise<Date[]> {
    return apiClient.get<Date[]>(`${BASE}/report/months`);
  },

  /** GET /api/transport-cost/report/vehicles/:id -- Phase O4: drill-down to individual postings. */
  async getPostingsForVehicle(
    contractedVehicleId: string,
    periodStart: Date,
    periodEnd: Date
  ): Promise<PostingDrillDown> {
    return apiClient.get<PostingDrillDown>(`${BASE}/report/vehicles/${contractedVehicleId}`, {
      params: { periodStart: periodStart.toISOString(), periodEnd: periodEnd.toISOString() },
    });
  },

  /**
   * GET /api/transport-cost/report/exceptions?format=json -- item 6:
   * the rejected/duplicate/period-outlier rows for a period, as JSON
   * (for an on-screen view, should one be built later).
   */
  async getDataQualityExceptions(periodStart: Date, periodEnd: Date): Promise<DataQualityExceptionsReport> {
    return apiClient.get<DataQualityExceptionsReport>(`${BASE}/report/exceptions`, {
      params: { periodStart: periodStart.toISOString(), periodEnd: periodEnd.toISOString() },
    });
  },

  /**
   * GET /api/transport-cost/report/exceptions?format=csv -- item 6:
   * downloads the same data as a CSV file. Bounded, single-period
   * dataset (like GL reconciliation's export, not a paginated bulk
   * table), so this calls apiClient.getBlob() directly rather than
   * going through the Phase 2 Enterprise Export Framework's
   * triggerExport()/X-Export-* truncation machinery, which exists for
   * paginated multi-page exports this report never has.
   */
  async downloadDataQualityExceptionsCsv(periodStart: Date, periodEnd: Date): Promise<void> {
    const fallbackFilename = `transport-cost-data-quality-exceptions-${periodStart.toISOString().slice(0, 10)}-${periodEnd
      .toISOString()
      .slice(0, 10)}.csv`;
    const { blob, filename } = await apiClient.getBlob(`${BASE}/report/exceptions`, {
      params: { periodStart: periodStart.toISOString(), periodEnd: periodEnd.toISOString(), format: 'csv' },
    });
    downloadBlob(blob, filename ?? fallbackFilename);
  },
};

export default transportCostApi;
