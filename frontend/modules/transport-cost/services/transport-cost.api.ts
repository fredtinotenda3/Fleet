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
  CommandCentreDrillDownDimension,
  CommandCentreDrillDownResult,
  DataQualityIssueKind,
  DataQualityIssueEvidenceResult,
  OperationalStatus,
  OperationalRecordView,
  SourceRecordPatch,
  PostSourceRecordOutcome,
  NormalizationReviewItem,
  NormalizationKind,
  ConfirmReviewMatchResult,
  ConfirmReviewNewResult,
  BusinessStream,
  AuditLogEntry,
  TransportPartner,
  ContractedVehicle,
  PendingMasterDataResult,
} from '../types';

const BASE = '/api/transport-cost';

/** Slice 3: a single type-ahead result -- backend's MasterDataSearchResult. */
export interface MasterDataSearchResult {
  id: string;
  label: string;
}

/**
 * PRODUCTION FIX (Slice 1-5 verification pass): mirrors backend's
 * MasterDataSearchPage -- every master-data search endpoint now returns
 * this shape instead of a bare `MasterDataSearchResult[]`, so the UI can
 * tell "this is everything that matched" from "this is the first page
 * of many" and render accordingly instead of silently truncating (the
 * root cause of the reported "only ~20 transporters/vehicles show up"
 * defect). See master-data.service.ts's MasterDataSearchPage doc comment
 * for the full reasoning.
 */
export interface MasterDataSearchPage {
  results: MasterDataSearchResult[];
  hasMore: boolean;
}

/** Slice 3: the response of a Customer/Destination find-or-create POST. */
export interface MasterDataCreateResult {
  id: string;
  name: string;
  /** false when the name already existed and the existing record was returned instead of creating a duplicate. */
  created: boolean;
}

/** GAP-CLOSURE PASS, Objective 5: the response of a Transporter/Vehicle request-new POST -- backend's flattened MasterDataController.requestNewTransporter/requestNewVehicle shape. */
export interface RequestNewMasterDataResponse {
  id: string;
  label: string;
  reviewStatus: 'auto-suggested' | 'confirmed' | 'needs-review';
  /** false when an exact match (confirmed OR already-pending) already existed -- the caller was NOT created. */
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

  /**
   * GET /api/transport-cost/command-centre/drilldown -- GAP-CLOSURE
   * PASS, Objective 4. `dimensionConstraint` omitted -> every posting in
   * the period+filters (a trend-point click); supplied -> narrowed to
   * one bar/card's exact evidence. See
   * TransportCostReportService.getCommandCentreDrillDown's own header.
   */
  async getCommandCentreDrillDown(
    periodStart: Date,
    periodEnd: Date,
    filters: CommandCentreFilters = {},
    dimensionConstraint?: { dimension: CommandCentreDrillDownDimension; key: string }
  ): Promise<CommandCentreDrillDownResult> {
    return apiClient.get<CommandCentreDrillDownResult>(`${BASE}/command-centre/drilldown`, {
      params: {
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        dimension: dimensionConstraint?.dimension,
        key: dimensionConstraint?.key,
        costFacingCompany: filters.costFacingCompany,
        costCategory: filters.costCategory,
        vehicleId: filters.vehicleId,
        transporterPartnerId: filters.transporterPartnerId,
        destinationTown: filters.destinationTown,
        customerName: filters.customerName,
      },
    });
  },

  /**
   * GET /api/transport-cost/command-centre/data-quality/:issue --
   * GAP-CLOSURE PASS, Objective 4. The evidence rows behind one trust-
   * panel count.
   */
  async getDataQualityIssueEvidence(
    issue: DataQualityIssueKind,
    periodStart: Date,
    periodEnd: Date
  ): Promise<DataQualityIssueEvidenceResult> {
    return apiClient.get<DataQualityIssueEvidenceResult>(`${BASE}/command-centre/data-quality/${issue}`, {
      params: { periodStart: periodStart.toISOString(), periodEnd: periodEnd.toISOString() },
    });
  },

  // ── Slice 3: Master Data Search + "+ Add New". ──────────────────────
  // Customer/Destination are write-capable find-or-create; Transporter/
  // Vehicle are search-only over the existing, review-gated master data
  // -- see modules/transport-cost/services/master-data.service.ts's
  // header for why there is no createTransporter/createVehicle here.

  /** GET /api/transport-cost/customers/search?q=... -- PRODUCTION FIX: returns { results, hasMore }, see MasterDataSearchPage. */
  async searchCustomers(query: string): Promise<MasterDataSearchPage> {
    return apiClient.get<MasterDataSearchPage>(`${BASE}/customers/search`, { params: { q: query } });
  },

  /** POST /api/transport-cost/customers -- find-or-create, immediately selectable. */
  async createCustomer(name: string): Promise<MasterDataCreateResult> {
    return apiClient.post<MasterDataCreateResult>(`${BASE}/customers`, { name });
  },

  /** GET /api/transport-cost/destinations/search?q=... -- PRODUCTION FIX: returns { results, hasMore }, see MasterDataSearchPage. */
  async searchDestinations(query: string): Promise<MasterDataSearchPage> {
    return apiClient.get<MasterDataSearchPage>(`${BASE}/destinations/search`, { params: { q: query } });
  },

  /** POST /api/transport-cost/destinations -- find-or-create, immediately selectable. */
  async createDestination(name: string): Promise<MasterDataCreateResult> {
    return apiClient.post<MasterDataCreateResult>(`${BASE}/destinations`, { name });
  },

  /** GET /api/transport-cost/transporters/search?q=... -- confirmed TransportPartner rows only. PRODUCTION FIX: returns { results, hasMore } -- this is the endpoint behind the "only ~20 transporters" defect, see MasterDataSearchPage. */
  async searchTransporters(query: string): Promise<MasterDataSearchPage> {
    return apiClient.get<MasterDataSearchPage>(`${BASE}/transporters/search`, { params: { q: query } });
  },

  /** GET /api/transport-cost/vehicles/search?q=&transporterPartnerId=... -- confirmed ContractedVehicle rows only. PRODUCTION FIX: returns { results, hasMore }, see MasterDataSearchPage. */
  async searchVehicles(query: string, transporterPartnerId?: string): Promise<MasterDataSearchPage> {
    return apiClient.get<MasterDataSearchPage>(`${BASE}/vehicles/search`, {
      params: { q: query, transporterPartnerId },
    });
  },

  // ── Phase O2: normalization review queue. ───────────────────────────
  // Backend has existed since O1/O2; these three routes were only ever
  // wired up as part of Slice 5 -- see app/api/transport-cost/
  // normalization-review/route.ts's own header for why.

  /** GET /api/transport-cost/normalization-review -- pending (or any
   *  status, via `status`) transporter/vehicle identities awaiting a
   *  human decision. */
  async listNormalizationReviewQueue(
    params: { kind?: NormalizationKind; page?: number; limit?: number } = {}
  ): Promise<PaginatedResponse<NormalizationReviewItem>> {
    return apiClient.get<PaginatedResponse<NormalizationReviewItem>>(`${BASE}/normalization-review`, {
      params: { kind: params.kind, page: params.page, limit: params.limit },
    });
  },

  /** POST /api/transport-cost/normalization-review/:id/confirm-match --
   *  "this raw value IS an existing TransportPartner/ContractedVehicle." */
  async confirmReviewMatch(reviewItemId: string, resolvedEntityId: string): Promise<ConfirmReviewMatchResult> {
    return apiClient.post<ConfirmReviewMatchResult>(`${BASE}/normalization-review/${reviewItemId}/confirm-match`, {
      resolvedEntityId,
    });
  },

  /** POST /api/transport-cost/normalization-review/:id/confirm-new --
   *  "this is a genuinely new transporter/vehicle" -- the only path that
   *  ever creates a new TransportPartner/ContractedVehicle row. */
  async confirmReviewNew(
    reviewItemId: string,
    transporterPartnerId?: string,
    businessStream?: BusinessStream
  ): Promise<ConfirmReviewNewResult> {
    return apiClient.post<ConfirmReviewNewResult>(`${BASE}/normalization-review/${reviewItemId}/confirm-new`, {
      transporterPartnerId,
      businessStream,
    });
  },

  /** POST /api/transport-cost/normalization-review/:id/reject -- requires a reason. */
  async rejectReviewItem(reviewItemId: string, reason: string): Promise<NormalizationReviewItem> {
    return apiClient.post<NormalizationReviewItem>(`${BASE}/normalization-review/${reviewItemId}/reject`, {
      reason,
    });
  },

  // ── OLIVINE LIVE OPERATING MODEL, SLICE 5: operational record CRUD. ─
  // See OLIVINE_LIVE_OPERATING_MODEL_GAP_ANALYSIS.md Section 8.2 for the
  // command design these mirror one-for-one; every method here maps to
  // exactly one TransportCostRecordCommandService method through exactly
  // one route -- no client-side branching reimplements any of the
  // state/permission logic those already enforce server-side.

  /** GET /api/transport-cost/source-records/statuses?ids=a,b,c -- bulk
   *  lifecycle status for the operational table's status column. At most
   *  200 ids per call (server-enforced) -- callers should chunk a larger
   *  id set rather than sending it all at once. */
  async getSourceRecordStatuses(ids: string[]): Promise<Record<string, OperationalStatus>> {
    if (ids.length === 0) return {};
    return apiClient.get<Record<string, OperationalStatus>>(`${BASE}/source-records/statuses`, {
      params: { ids: ids.join(',') },
    });
  },

  /** GET /api/transport-cost/source-records/:id -- the transport-
   *  operation detail view's single data source: current fields, derived
   *  lifecycle status, the live posting (if any), and the full posting
   *  history (original/reversal/correction trail). */
  async getOperationalRecord(sourceRecordId: string): Promise<OperationalRecordView> {
    return apiClient.get<OperationalRecordView>(`${BASE}/source-records/${sourceRecordId}`);
  },

  /** PATCH /api/transport-cost/source-records/:id -- Edit. Non-financial
   *  fields on any non-cancelled record, or any field on a never-posted
   *  record. Refused server-side if the patch touches a financial field
   *  on an already-posted record -- use correctPostedSourceRecord instead. */
  async editSourceRecord(sourceRecordId: string, patch: SourceRecordPatch): Promise<TransportCostSourceRecord> {
    return apiClient.patch<TransportCostSourceRecord>(`${BASE}/source-records/${sourceRecordId}`, patch);
  },

  /** POST /api/transport-cost/source-records/:id/correct -- Correct. The
   *  only way to change a financial field on a POSTED record: applies
   *  the patch, then reverses the live posting and reposts. */
  async correctPostedSourceRecord(
    sourceRecordId: string,
    patch: SourceRecordPatch
  ): Promise<{ source: TransportCostSourceRecord; outcome: PostSourceRecordOutcome }> {
    return apiClient.post<{ source: TransportCostSourceRecord; outcome: PostSourceRecordOutcome }>(
      `${BASE}/source-records/${sourceRecordId}/correct`,
      patch
    );
  },

  /** POST /api/transport-cost/source-records/:id/cancel -- Cancel. Body:
   *  { reason }. If the record is already posted, this also reverses its
   *  ledger entry (no repost) -- requires FINANCE_MANAGE server-side in
   *  that case, checked once the record's actual state is known. */
  async cancelSourceRecord(sourceRecordId: string, reason: string): Promise<TransportCostSourceRecord> {
    return apiClient.post<TransportCostSourceRecord>(`${BASE}/source-records/${sourceRecordId}/cancel`, { reason });
  },

  /** POST /api/transport-cost/source-records/:id/duplicate -- Duplicate.
   *  Creates a new, unposted record copying the original's editable
   *  fields; never copies a confirmed vehicle/transporter identity or
   *  links to the original's ledger posting. */
  async duplicateSourceRecord(sourceRecordId: string): Promise<TransportCostSourceRecord> {
    return apiClient.post<TransportCostSourceRecord>(`${BASE}/source-records/${sourceRecordId}/duplicate`);
  },

  /** GET /api/transport-cost/source-records/:id/audit?page=&limit= -- GAP-CLOSURE PASS, Objective 1. */
  async getSourceRecordAuditHistory(
    sourceRecordId: string,
    params: { page?: number; limit?: number } = {}
  ): Promise<PaginatedResponse<AuditLogEntry>> {
    return apiClient.get<PaginatedResponse<AuditLogEntry>>(`${BASE}/source-records/${sourceRecordId}/audit`, {
      params: { page: params.page, limit: params.limit },
    });
  },

  // ── GAP-CLOSURE PASS, Objective 5: request-new + pending master data. ──
  // See master-data.controller.ts's own header for why these are
  // deliberately separate from searchTransporters/searchVehicles above.

  /** POST /api/transport-cost/transporters/request-new  Body: { name }. Find-existing-or-request-new (reviewStatus: 'needs-review' when newly created). */
  async requestNewTransporter(name: string): Promise<RequestNewMasterDataResponse> {
    return apiClient.post<RequestNewMasterDataResponse>(`${BASE}/transporters/request-new`, { name });
  },

  /** POST /api/transport-cost/vehicles/request-new  Body: { registration, transporterPartnerId, businessStream?, sourceRecordId? }. */
  async requestNewVehicle(params: {
    registration: string;
    transporterPartnerId: string;
    businessStream?: BusinessStream;
    sourceRecordId?: string;
  }): Promise<RequestNewMasterDataResponse> {
    return apiClient.post<RequestNewMasterDataResponse>(`${BASE}/vehicles/request-new`, params);
  },

  /** GET /api/transport-cost/master-data/pending -- transporters+vehicles awaiting confirm/reject. */
  async listPendingMasterData(): Promise<PendingMasterDataResult> {
    return apiClient.get<PendingMasterDataResult>(`${BASE}/master-data/pending`);
  },

  /** POST /api/transport-cost/master-data/:kind/:id/confirm */
  async confirmPendingMasterData(kind: NormalizationKind, id: string): Promise<TransportPartner | ContractedVehicle> {
    return apiClient.post(`${BASE}/master-data/${kind}/${id}/confirm`);
  },

  /** POST /api/transport-cost/master-data/:kind/:id/reject  Body: { reason }. */
  async rejectPendingMasterData(kind: NormalizationKind, id: string, reason: string): Promise<TransportPartner | ContractedVehicle> {
    return apiClient.post(`${BASE}/master-data/${kind}/${id}/reject`, { reason });
  },
};

export default transportCostApi;
