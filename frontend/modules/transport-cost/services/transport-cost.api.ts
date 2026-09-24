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
import type {
  TransportCostAllocationReport,
  PostingDrillDown,
  DataQualityExceptionsReport,
  CommandCentreGranularity,
  CommandCentreFilters,
  CommandCentreSummary,
} from '../types';

const BASE = '/api/transport-cost';

/** Slice 3: a single type-ahead result -- backend's MasterDataSearchResult. */
export interface MasterDataSearchResult {
  id: string;
  label: string;
}

/** Slice 3: the response of a Customer/Destination find-or-create POST. */
export interface MasterDataCreateResult {
  id: string;
  name: string;
  /** false when the name already existed and the existing record was returned instead of creating a duplicate. */
  created: boolean;
}

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

  /** POST /api/transport-cost/import/vansales. `periodMonth` ("YYYY-MM")
   *  is required -- Vansales periodization Option A, see
   *  VANSALES_PERIODIZATION_DECISION.md -- the calendar month this
   *  whole batch's retainer rows cover. */
  async importVansales(
    rows: Array<Record<string, unknown>>,
    sourceFileName: string,
    periodMonth: string
  ): Promise<ImportResponse> {
    return apiClient.post<ImportResponse>(`${BASE}/import/vansales`, { rows, sourceFileName, periodMonth });
  },

  /** POST /api/transport-cost/import/swift. One tolerant parser over a
   *  small required-column subset (Cons. date + Cons. Number) -- see
   *  validateAndBuildSwift's header. No periodMonth: Swift rows are
   *  dated per-row like 3rd Party, not a fixed monthly retainer. */
  async importSwift(rows: Array<Record<string, unknown>>, sourceFileName: string): Promise<ImportResponse> {
    return apiClient.post<ImportResponse>(`${BASE}/import/swift`, { rows, sourceFileName });
  },

  /** POST /api/transport-cost/import/depot-sto. One tolerant parser over
   *  the union of every real column seen across six months' worth of
   *  drifted Depot STO sheet layouts -- see validateAndBuildDepotSto's
   *  header and DEPOT_STO_DECISION.md. No periodMonth: DATE is used
   *  as-is per row, like 3rd Party/Swift, not a declared retainer month. */
  async importDepotSto(rows: Array<Record<string, unknown>>, sourceFileName: string): Promise<ImportResponse> {
    return apiClient.post<ImportResponse>(`${BASE}/import/depot-sto`, { rows, sourceFileName });
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

  /**
   * GET /api/transport-cost/command-centre/summary -- Command Centre
   * Slice A/B/C. ONE request for the whole dashboard (every KPI card,
   * every chart, the trust panel) -- see
   * TransportCostReportService.getCommandCentreSummary's own header for
   * why this is deliberately not several smaller endpoints.
   */
  async getCommandCentreSummary(
    periodStart: Date,
    periodEnd: Date,
    granularity: CommandCentreGranularity,
    filters: CommandCentreFilters = {}
  ): Promise<CommandCentreSummary> {
    return apiClient.get<CommandCentreSummary>(`${BASE}/command-centre/summary`, {
      params: {
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        granularity,
        costFacingCompany: filters.costFacingCompany,
        costCategory: filters.costCategory,
        vehicleId: filters.vehicleId,
        transporterPartnerId: filters.transporterPartnerId,
        destinationTown: filters.destinationTown,
        customerName: filters.customerName,
      },
    });
  },

  // ── Slice 3: Master Data Search + "+ Add New". ──────────────────────
  // Customer/Destination are write-capable find-or-create; Transporter/
  // Vehicle are search-only over the existing, review-gated master data
  // -- see modules/transport-cost/services/master-data.service.ts's
  // header for why there is no createTransporter/createVehicle here.

  /** GET /api/transport-cost/customers/search?q=... */
  async searchCustomers(query: string): Promise<MasterDataSearchResult[]> {
    return apiClient.get<MasterDataSearchResult[]>(`${BASE}/customers/search`, { params: { q: query } });
  },

  /** POST /api/transport-cost/customers -- find-or-create, immediately selectable. */
  async createCustomer(name: string): Promise<MasterDataCreateResult> {
    return apiClient.post<MasterDataCreateResult>(`${BASE}/customers`, { name });
  },

  /** GET /api/transport-cost/destinations/search?q=... */
  async searchDestinations(query: string): Promise<MasterDataSearchResult[]> {
    return apiClient.get<MasterDataSearchResult[]>(`${BASE}/destinations/search`, { params: { q: query } });
  },

  /** POST /api/transport-cost/destinations -- find-or-create, immediately selectable. */
  async createDestination(name: string): Promise<MasterDataCreateResult> {
    return apiClient.post<MasterDataCreateResult>(`${BASE}/destinations`, { name });
  },

  /** GET /api/transport-cost/transporters/search?q=... -- confirmed TransportPartner rows only. */
  async searchTransporters(query: string): Promise<MasterDataSearchResult[]> {
    return apiClient.get<MasterDataSearchResult[]>(`${BASE}/transporters/search`, { params: { q: query } });
  },

  /** GET /api/transport-cost/vehicles/search?q=&transporterPartnerId=... -- confirmed ContractedVehicle rows only. */
  async searchVehicles(query: string, transporterPartnerId?: string): Promise<MasterDataSearchResult[]> {
    return apiClient.get<MasterDataSearchResult[]>(`${BASE}/vehicles/search`, {
      params: { q: query, transporterPartnerId },
    });
  },
};

export default transportCostApi;
