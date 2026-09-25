// modules/transport-cost/services/transport-cost-report.service.ts
//
// Phase O4 (minimal slice, per the client's explicit instruction: "one
// working report/drill-down screen -- Business Stream -> Vehicle/
// Transporter -> time range -- sourced from the Allocation Ledger
// postings O3 creates, not from raw source records").
//
// ---------------------------------------------------------------------
// SOURCED FROM POSTINGS ONLY -- read this before adding a call site
// ---------------------------------------------------------------------
// Every total here comes from tblallocationledger (via
// allocationLedgerRepository), never from tbltransportcostsourcerecords
// directly. TransportPartner/ContractedVehicle are read ONLY to resolve
// DISPLAY names (registration, transporter, business stream) for a
// vehicleId already present on a posting -- never to compute a total.
// This is what makes the pending-rows banner honest rather than
// decorative: the NUMBER on screen is exactly what O3 actually posted
// (append-only, reversal-aware), and the banner is a separate,
// explicitly-labelled fact about UNPOSTED evidence for the same period,
// never blended into the total itself.
//
// ---------------------------------------------------------------------
// BUSINESS STREAM: MOSTLY "UNATTRIBUTED" FOR JANUARY 2026, ON PURPOSE
// ---------------------------------------------------------------------
// ContractedVehicle.businessStream is optional and is only ever set when
// a human confirming an O2 review item supplies one (see
// confirm-review-new.handler.ts) -- it is never inferred by code. The
// real January 2026 "3rd Party" sheet carries NO business-stream
// indicator anywhere (no per-stream tab split, no explicit column --
// verified against the source workbook; later months' 3rd Party tabs
// ARE sometimes split into per-stream sub-tabs, e.g. "MAY -26 3rd Party
// Olivine" / "...Hypery", but Jan's is not, and that tab-name signal is
// not yet wired into the import command in this slice -- see the
// delivery README's open items). So every vehicle first confirmed from
// January data will show under the 'unattributed' bucket below unless a
// reviewer supplied a stream by hand. This is the honest state of
// today's real data, not a bug -- the Stream -> Vehicle hierarchy is
// fully built and will populate correctly the moment a source or a
// reviewer actually reveals the stream for a row.

import {
  allocationLedgerRepository,
  AllocationLedgerRepository,
} from '@/modules/finance/repositories/allocation-ledger.repository';
import {
  transportCostSourceRecordRepository,
  TransportCostSourceRecordRepository,
  DataQualityIssueKind,
} from '../repositories/transport-cost-source-record.repository';
import { contractedVehicleRepository, ContractedVehicleRepository } from '../repositories/contracted-vehicle.repository';
import { transportPartnerRepository, TransportPartnerRepository } from '../repositories/transport-partner.repository';
import type { ContractedVehicle } from '@/shared/types/contracted-vehicle.types';
import type { TransportPartner } from '@/shared/types/transport-partner.types';
import {
  transportCostImportExceptionRepository,
  TransportCostImportExceptionRepository,
} from '../repositories/transport-cost-import-exception.repository';
import { financeSettingsService, FinanceSettingsService } from '@/modules/finance/services/finance-settings.service';
import type { AllocationPosting, AllocationCostCategory } from '@/modules/finance/types/allocation.types';
import type { TenantContext } from '@/modules/tenancy/services/tenant-context.service';
import type { TransportCostSheetFamily, TransportCostSourceRecord } from '@/shared/types/transport-cost.types';
import type { TransportCostImportException } from '@/shared/types/transport-cost-import-exception.types';
import { NotFoundError, ValidationError } from '@/server/errors/app.errors';
import { roundCurrency } from '@/modules/finance/utils/fx-conversion.utils';
import { costFacingCompanyLabel, CostFacingCompany } from '@/shared/types/cost-facing-company.types';

// 'third-party-transport' only, STILL -- a deliberate, documented scope
// boundary of the Vansales-posting slice, not an oversight left over
// from when Vansales could not post at all.
//
// Decision: this drill-down screen keeps reading third-party-transport
// exclusively, even though TransportCostPostingService now also posts
// Vansales rows under 'transport-retainer' (see that service's header
// and VANSALES_PERIODIZATION_DECISION.md).
// Reason: a delivery cost and a fixed monthly retainer are different
// unit-economics (audit Section B) -- silently summing them into one
// per-vehicle total here would blend two numbers Olivine explicitly
// wants to see as separate streams, which is a UI/reporting design
// decision (how to label and split a combined view), not a posting
// decision. The four repository methods this service calls
// (AllocationLedgerRepository.getNetTotalsByVehicleForCategory and
// its three siblings) already accept an array of cost categories, so
// widening this screen is a query-parameter change, not a schema or
// architecture change, whenever that UI work is scheduled.
// Assumption: Vansales postings are NOT invisible in the meantime --
// they are fully queryable via the same repository methods with
// `costCategory: 'transport-retainer'` (see
// scripts/verify-phase-o3-o4.ts's Vansales reconciliation section for
// exactly that), just not blended into THIS screen's totals yet.
// Reversibility: trivially reversible -- change COST_CATEGORY below to
// an array (or add a stream toggle/breakdown in the UI) whenever that
// design work happens; no ledger or repository change is needed.
//
// THAT REVERSAL HAS NOW HAPPENED, BUT ADDITIVELY, NOT IN PLACE --
// see OLIVINE_COST_INTELLIGENCE_COMMAND_CENTRE_DESIGN.md Section 6.0.
// COST_CATEGORY stays exactly as it was so this O4 screen's existing
// numbers are never silently reinterpreted; TRANSPORT_COST_CATEGORIES
// below is the widened set the new Command Centre methods use instead.
const COST_CATEGORY = 'third-party-transport' as const;

/**
 * The full set of transport-cost categories, for the Command Centre
 * (Slice A onward) -- unlike COST_CATEGORY above, which intentionally
 * stays pinned to 'third-party-transport' so the existing O4 report
 * screen's totals never change underneath it. Every repository method
 * these categories are passed to already accepts
 * `AllocationCostCategory | AllocationCostCategory[]` via
 * costCategoryMatch() (allocation-ledger.repository.ts) -- this is a
 * query-parameter change, not a schema or repository-architecture one.
 */
export const TRANSPORT_COST_CATEGORIES: AllocationCostCategory[] = [
  'third-party-transport',
  'transport-retainer',
  'stock-transfer',
];
const UNATTRIBUTED = 'unattributed' as const;

export interface VehicleGroupTotal {
  contractedVehicleId: string;
  registration: string;
  transporterName: string;
  businessStream: string;
  reportingCurrency: string;
  netReportingAmount: number;
  postingCount: number;
}

export interface StreamGroupTotal {
  businessStream: string;
  reportingCurrency: string;
  netReportingAmount: number;
  postingCount: number;
  vehicleCount: number;
}

/**
 * ADDED, OLIVINE LIVE OPERATING MODEL (item 2/3/4/10/11). The
 * cost-facing company breakdown -- Hypery / Olivine / Surface, plus
 * "Unattributed" for a posting whose source record predates this field.
 * `costFacingCompany` is the raw stored token ('hypery'/'olivine'/
 * 'surface'/'unattributed'); `label` is the display form, resolved via
 * costFacingCompanyLabel so every screen shows "Hypery" rather than the
 * raw lowercase token.
 */
export interface CompanyGroupTotal {
  costFacingCompany: string;
  label: string;
  reportingCurrency: string;
  netReportingAmount: number;
  postingCount: number;
}

export interface TransportCostAllocationReport {
  periodStart: Date;
  periodEnd: Date;
  reportingCurrency: string;
  byBusinessStream: StreamGroupTotal[];
  byCompany: CompanyGroupTotal[];
  byVehicle: VehicleGroupTotal[];
  /** More than one reportingCurrency appeared in this period's postings
   *  -- see AllocationService.getCostPerKm's identical handling. When
   *  true, netReportingAmount figures above are per-currency subtotals,
   *  never summed across currencies. */
  mixedReportingCurrencies?: string[];
  pending: {
    pendingSourceRecordCount: number;
    /** Never presented as final when true -- the screen's own banner flag. */
    hasPendingAmounts: boolean;
  };
  /**
   * OLIVINE LIVE OPERATING MODEL, SLICE 2 (item 6/7's reporting
   * requirement -- "TRANSPORT OPERATIONS vs TRANSPORT LINES/LOADS", kept
   * explicitly separate from every total above). A pure OPERATIONAL
   * count -- never a cost figure, never summed into `byCompany`/
   * `byVehicle`/`byBusinessStream` above, which all remain sourced from
   * postings exactly as before this slice. See
   * TransportCostSourceRecordRepository.getLoadSummaryInScope's own doc
   * comment for the full reasoning and its "source-record read, not a
   * ledger read" scoping.
   */
  loadSummary: {
    totalOperations: number;
    totalLines: number;
    multiLineOperationCount: number;
  };
}

export interface PostingDrillDown {
  contractedVehicleId: string;
  registration: string;
  transporterName: string;
  businessStream: string;
  postings: AllocationPosting[];
}

/**
 * ADDED, item 6 (data-quality exceptions export). One findable row of
 * evidence explaining why some piece of a period's data is NOT in the
 * report above -- a row that was rejected at import, a row flagged as a
 * likely duplicate, or a row that DID post but whose own transaction
 * date falls outside the requested window (a "period outlier", e.g. a
 * year-entry typo). See getDataQualityExceptions's header for how the
 * three kinds are found.
 *
 * The raw* fields are read from the row's own original cells (rawRow
 * for 'rejected'/'duplicate', the resolved source record's own
 * registrationRaw/transporterRaw/rawDate for 'period-outlier') --
 * deliberately never the normalized/parsed fields, since the entire
 * point of this report is to show Olivine exactly what was in the
 * source file for a row that did not make it into the money above.
 */
export interface DataQualityExceptionRow {
  kind: 'rejected' | 'duplicate' | 'period-outlier';
  importBatchId: string;
  sourceFileName: string;
  sourceRowNumber: number;
  rawDate?: string;
  rawRegistration?: string;
  rawTransporter?: string;
  /** Left as the raw string/number the source cell held -- see
   *  TransportCostSourceRecord.amount's own null-not-zero doc comment;
   *  this field carries the same "never coerce a blank to 0" discipline. */
  amount?: string;
  /** The specific validation rule / duplicate match / outlier reason,
   *  verbatim -- never a re-derived summary. */
  reason: string;
  /** Set only for 'rejected': the column the validation rule rejected on. */
  column?: string;
  invalidValue?: string;
}

export interface DataQualityExceptionsReport {
  periodStart: Date;
  periodEnd: Date;
  rejected: DataQualityExceptionRow[];
  duplicates: DataQualityExceptionRow[];
  periodOutliers: DataQualityExceptionRow[];
}

// =====================================================================
// COMMAND CENTRE (Slice A/B/C). See
// OLIVINE_COST_INTELLIGENCE_COMMAND_CENTRE_DESIGN.md and
// OLIVINE_LIVE_OPERATING_MODEL_GAP_ANALYSIS.md Section 7 for the full
// design record this implements.
// =====================================================================

/** Time-bucket size for the trend chart. Adaptive to the requested
 *  range by the CALLER (see the controller/frontend), not chosen here --
 *  this service takes whatever granularity it is given and buckets
 *  honestly, so a caller error (e.g. "daily" over a 2-year range) is a
 *  slow response, never a silently wrong one; the route enforces
 *  MAX_COMMAND_CENTRE_RANGE_DAYS specifically to bound that. */
export type CommandCentreGranularity = 'day' | 'week' | 'month';

/**
 * Every filter the milestone's brief requires, all optional. See
 * getCommandCentreSummary's own header for exactly how each is applied
 * (pushed into the ledger $match, resolved to a vehicle-id set first, or
 * matched against a joined source record) and the FILTER-VS-BREAKDOWN
 * semantics note for destinationTown/customerName specifically.
 */
export interface CommandCentreFilters {
  costFacingCompany?: CostFacingCompany;
  /** Must be one of TRANSPORT_COST_CATEGORIES -- validated, not merely typed. */
  costCategory?: AllocationCostCategory;
  vehicleId?: string;
  transporterPartnerId?: string;
  /** Exact, case-insensitive match against a source record's flat field OR any of its lines[] -- see matchesDestinationOrCustomer's header (source-record repository). */
  destinationTown?: string;
  customerName?: string;
}

export interface CommandCentreDimensionTotal {
  /** The raw grouping key -- a CostFacingCompany token, an AllocationCostCategory token, a contractedVehicleId, a transporterPartnerId, a destinationTown, or a customerName. 'unattributed'/'unavailable'/'not-applicable' for the documented missing-dimension cases -- never a fabricated bucket name. */
  key: string;
  label: string;
  reportingCurrency: string;
  netReportingAmount: number;
  postingCount: number;
}

export interface CommandCentreTimeSeriesBucket {
  bucketStart: Date;
  bucketEnd: Date;
  reportingCurrency: string;
  netReportingAmount: number;
  postingCount: number;
}

/**
 * Slice C's trust panel. Every count here is INDEPENDENT and some
 * legitimately overlap (a row can be both `missingTonnage` and
 * `unresolvedVehicle`) -- see getDataQualityBreakdown's own header
 * (source-record repository) for the full Missing/Unresolved/Not
 * applicable/Rejected/Duplicate vocabulary this implements.
 */
export interface CommandCentreDataQuality {
  /** Rows imported successfully but with no Amount cell yet -- same figure as getAllocationReport's own pending banner, widened across all four sheet families. */
  pendingAmountCount: number;
  rejectedCount: number;
  duplicateCount: number;
  periodOutlierCount: number;
  missingCostFacingCompany: number;
  missingRegistration: number;
  unresolvedVehicle: number;
  vehicleNotApplicable: number;
  unresolvedTransporter: number;
  missingCustomer: number;
  missingDestination: number;
  destinationNotApplicable: number;
  missingTonnage: number;
}

export interface CommandCentreSummary {
  periodStart: Date;
  periodEnd: Date;
  granularity: CommandCentreGranularity;
  filters: CommandCentreFilters;
  /** Per-currency period total(s) -- NEVER summed across currencies, same discipline as getAllocationReport. Empty when nothing posted in scope: "No data", never a fabricated $0 row. */
  totals: CommandCentreDimensionTotal[];
  mixedReportingCurrencies?: string[];
  byCompany: CommandCentreDimensionTotal[];
  byCategory: CommandCentreDimensionTotal[];
  byVehicle: CommandCentreDimensionTotal[];
  byTransporter: CommandCentreDimensionTotal[];
  /** Attributed to each record's PRIMARY (flat/line-1) destination only -- see the FILTER-VS-BREAKDOWN semantics note in getCommandCentreSummary's header for why, and why this sums correctly back to `totals` even when a matching operation has several differently-destined lines. */
  byDestination: CommandCentreDimensionTotal[];
  byCustomer: CommandCentreDimensionTotal[];
  timeSeries: CommandCentreTimeSeriesBucket[];
  /** OPERATIONAL, never financial -- see loadSummary's own doc comment on TransportCostAllocationReport above; the same discipline applies here. */
  operational: { totalOperations: number; totalLines: number; multiLineOperationCount: number };
  dataQuality: CommandCentreDataQuality;
  pending: { pendingSourceRecordCount: number; hasPendingAmounts: boolean };
}

export type { DataQualityIssueKind };

/**
 * GAP-CLOSURE PASS, Objective 4 ("Command Centre Slice B/C" --
 * evidence/traceability). One of the seven groupings
 * getCommandCentreSummary already buckets by (byCompany/byCategory/
 * byVehicle/byTransporter/byDestination/byCustomer -- `totals` itself is
 * the eighth, ungrouped case, reached by omitting the constraint
 * entirely, e.g. for a trend-point click). Deliberately the SAME
 * vocabulary as CommandCentreDimensionTotal's own `key` values, not a
 * new taxonomy.
 */
export type CommandCentreDrillDownDimension = 'company' | 'category' | 'vehicle' | 'transporter' | 'destination' | 'customer';

/**
 * One row of evidence behind a Command Centre metric -- the operation
 * (source record) and the exact ledger posting that metric was built
 * from. `sourceRecordId` is the link back to
 * TransportOperationDetailPage, which now itself carries the ledger
 * posting history AND the audit-history section (Objective 1) -- this
 * is the "Command Centre metric -> operation/source record -> financial
 * posting -> audit history" traceability chain the milestone requires,
 * closed by composition rather than by building a second, parallel
 * evidence viewer.
 */
export interface CommandCentreDrillDownRow {
  sourceRecordId: string;
  postingId: string;
  /** The posting's own periodStart -- the transaction date, not postedAt (audit metadata). Same convention as PostingDrillDown/VehicleDrillDownDialog. */
  date: Date;
  costFacingCompany: string | null;
  costCategory: AllocationCostCategory;
  vehicleId: string;
  registration: string;
  transporterPartnerId?: string;
  transporterName: string;
  destinationTown?: string;
  customerName?: string;
  sheetFamily?: TransportCostSheetFamily;
  reportingAmount: number;
  reportingCurrency: string;
}

/** Bounds every drill-down's row list to a page a dialog can render responsively -- `truncated` tells the UI to say "showing the first N of <rowCount>" rather than silently dropping rows. `totals` is reduced over the FULL constrained set (not just the returned page), so it always reconciles to the bar/card the drill-down was opened from even when rows are truncated. */
export const COMMAND_CENTRE_DRILL_DOWN_ROW_LIMIT = 500;

export interface CommandCentreDrillDownResult {
  /** Omitted for an unconstrained (e.g. trend-point) drill-down. */
  dimension?: CommandCentreDrillDownDimension;
  key?: string;
  label?: string;
  periodStart: Date;
  periodEnd: Date;
  filters: CommandCentreFilters;
  totals: CommandCentreDimensionTotal[];
  rows: CommandCentreDrillDownRow[];
  rowCount: number;
  truncated: boolean;
}

/** One row of evidence behind a `CommandCentreDataQuality` count -- see TransportCostSourceRecordRepository.findByDataQualityIssue's own header for why this can never disagree with the count itself. */
export interface DataQualityIssueEvidenceRow {
  sourceRecordId: string;
  sheetFamily: TransportCostSheetFamily;
  importBatchId: string;
  sourceFileName: string;
  sourceRowNumber: number;
  date: Date | null;
  rawDate: string;
  registrationRaw: string;
  transporterRaw: string;
  customerName?: string;
  destinationTown?: string;
  costFacingCompany?: string;
}

export interface DataQualityIssueEvidenceResult {
  issue: DataQualityIssueKind;
  periodStart: Date;
  periodEnd: Date;
  rows: DataQualityIssueEvidenceRow[];
  rowCount: number;
  truncated: boolean;
}

/**
 * ADDED, Command Centre Slice A. Buckets a Date into the start of its
 * day/ISO-week(Monday)/month, in UTC -- the trend chart's grouping key.
 * Node-side, not a Mongo $group, for the same reason
 * AllocationLedgerRepository.getDistinctPostedMonths documents: this
 * repository's test double (tests/helpers/fake-collection.ts) has no
 * $dateTrunc/$isoWeek, and the dataset this buckets is already a bounded
 * (<=100000-row, date-range-limited) fetch, so a second in-memory pass
 * over it costs nothing material. Documented scale caveat: if a single
 * tenant's transport-cost postings ever exceed the 100000-row bound
 * within one requested range, this (and every other bounded-fetch path
 * in this service) undercounts silently rather than erroring -- see
 * MAX_COMMAND_CENTRE_RANGE_DAYS below for the mitigation this milestone
 * ships, and the changelog's "remaining gaps" section for the real fix
 * (a rollup/summary collection) if that bound is ever actually hit.
 */
function bucketStartFor(date: Date, granularity: CommandCentreGranularity): Date {
  const d = new Date(date);
  if (granularity === 'day') {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }
  if (granularity === 'month') {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  }
  // week: Monday-start ISO week.
  const dayOfWeek = d.getUTCDay(); // 0=Sun..6=Sat
  const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diffToMonday));
  return monday;
}

function bucketEndFor(bucketStart: Date, granularity: CommandCentreGranularity): Date {
  if (granularity === 'day') {
    return new Date(bucketStart.getTime() + 24 * 60 * 60 * 1000 - 1);
  }
  if (granularity === 'week') {
    return new Date(bucketStart.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);
  }
  const y = bucketStart.getUTCFullYear();
  const m = bucketStart.getUTCMonth();
  return new Date(Date.UTC(y, m + 1, 1) - 1);
}

const CATEGORY_LABELS: Record<AllocationCostCategory, string> = {
  'third-party-transport': 'Third-party transport',
  'transport-retainer': 'Transport retainer',
  'stock-transfer': 'Stock transfer',
  fuel: 'Fuel',
  maintenance: 'Maintenance',
  expense: 'Expense',
  depreciation: 'Depreciation',
  insurance: 'Insurance',
  other: 'Other',
};

const UNAVAILABLE = 'unavailable' as const;
const NOT_APPLICABLE = 'not-applicable' as const;

/**
 * ADDED, Command Centre Slice A. `destinationTown`/`customerName`
 * bucketing for the byDestination/byCustomer charts -- deliberately
 * reads ONLY the record's own flat (line-1) field, never `lines[1..]`.
 *
 * This is the load-bearing half of the FILTER-VS-BREAKDOWN semantics
 * decision documented in getCommandCentreSummary's header: a FILTER
 * (customer=X) uses OR-over-lines (broad recall), which is safe because
 * it only decides inclusion/exclusion of an already-one-posting-per-
 * record row. A BREAKDOWN (chart the total BY customer) cannot use the
 * same OR-over-lines rule -- if it bucketed one record's single posting
 * amount under every distinct line customer it has, a two-line
 * operation naming two different customers would contribute its full
 * cost to BOTH customers' bars, and the chart's bars would sum to MORE
 * than `totals` above them. That is exactly the "multiply financial
 * totals because multiple child lines match" failure item 13/14 of the
 * milestone's own test list exists to catch. Bucketing by the flat
 * (line-1) field instead guarantees each posting's amount is counted in
 * EXACTLY one bucket, so byDestination/byCustomer always sum back to
 * the same total as `totals` -- the correctness property this function
 * exists to preserve, verified in
 * transport-cost-command-centre.service.spec.ts.
 */
function destinationBucketKey(record: TransportCostSourceRecord | undefined): string {
  if (!record) return UNAVAILABLE;
  if (record.destinationTown && record.destinationTown.trim()) return record.destinationTown.trim();
  return record.sheetFamily === 'vansales' ? NOT_APPLICABLE : UNAVAILABLE;
}

function customerBucketKey(record: TransportCostSourceRecord | undefined): string {
  if (!record) return UNAVAILABLE;
  if (record.customerName && record.customerName.trim()) return record.customerName.trim();
  return UNAVAILABLE;
}

function bucketLabel(key: string): string {
  if (key === UNAVAILABLE) return 'Unavailable';
  if (key === NOT_APPLICABLE) return 'Not applicable';
  return key;
}

/**
 * OR-over-lines match, used for the destination/customer FILTER (never
 * the breakdown -- see destinationBucketKey's header for why the two
 * must differ). Exported implicitly via the service method only; kept
 * private to this file since no other module needs this exact
 * predicate.
 */
function matchesDestinationCustomerFilter(
  record: TransportCostSourceRecord | undefined,
  destinationTown?: string,
  customerName?: string
): boolean {
  if (!record) return false;
  const norm = (v?: string) => (v ?? '').trim().toLowerCase();
  const matchesOne = (needle: string | undefined, flat: string | undefined, lines: Array<string | undefined>) => {
    if (!needle || !needle.trim()) return true;
    const target = norm(needle);
    if (norm(flat) === target) return true;
    return lines.some((v) => norm(v) === target && !!v);
  };
  return (
    matchesOne(destinationTown, record.destinationTown, (record.lines ?? []).map((l) => l.destinationTown)) &&
    matchesOne(customerName, record.customerName, (record.lines ?? []).map((l) => l.customerName))
  );
}

/**
 * GAP-CLOSURE PASS, Objective 4. THE single place that derives a
 * dimension bucket key from a posting -- both
 * getCommandCentreSummary's accumulate loop (the bars/cards) and
 * getCommandCentreDrillDown (the evidence behind a clicked bar/card)
 * call this, so "which bucket does this posting belong to" can never be
 * computed two different ways in two different places. For
 * 'destination'/'customer' this is deliberately the BREAKDOWN
 * (flat/line-1-only) key, never the broader OR-over-lines FILTER
 * predicate -- see destinationBucketKey/customerBucketKey's own header:
 * using the filter's broader match here would let a drill-down return
 * MORE postings than the bar's own count, which would make the
 * drill-down's total disagree with the card that opened it.
 */
function dimensionKeyFor(
  dimension: CommandCentreDrillDownDimension,
  posting: AllocationPosting,
  record: TransportCostSourceRecord | undefined,
  vehicleById: Map<string, ContractedVehicle>
): string {
  switch (dimension) {
    case 'company':
      return posting.costFacingCompany ?? 'unattributed';
    case 'category':
      return posting.costCategory;
    case 'vehicle':
      return posting.vehicleId;
    case 'transporter': {
      // Deliberately mirrors the accumulate loop's own
      // `transporterPartnerId ?? UNAVAILABLE` exactly -- keyed by the
      // raw id even if partnerById can't resolve a display name for it
      // (a deleted/orphaned partner reference), never silently
      // re-bucketed to UNAVAILABLE, or this key would stop matching the
      // bar's own key the moment a partner lookup fails.
      const vehicle = vehicleById.get(posting.vehicleId);
      return vehicle?.transporterPartnerId ?? UNAVAILABLE;
    }
    case 'destination':
      return destinationBucketKey(record);
    case 'customer':
      return customerBucketKey(record);
  }
}

/**
 * ADDED, Command Centre Slice A. Resolves the transporter/vehicle
 * filters to AT MOST ONE of `{vehicleId}` / `{vehicleIds}` (never both
 * -- see AllocationLedgerRepository.buildVehicleConstraint's header for
 * why passing both independently would be a collision hazard at the
 * repository layer; this is where that combination is actually decided).
 *
 * A `transporterPartnerId` filter combined with a `vehicleId` filter
 * that does NOT belong to that transporter is a genuine contradiction --
 * resolved to `{vehicleIds: []}` (matches nothing), never silently
 * dropping one of the two filters the caller asked for.
 */
async function resolveVehicleScope(
  filters: CommandCentreFilters,
  vehicleRepo: ContractedVehicleRepository,
  organizationId: string
): Promise<{ vehicleId?: string; vehicleIds?: string[] }> {
  if (filters.transporterPartnerId) {
    const vehicles = await vehicleRepo.findByTransporterPartnerId(filters.transporterPartnerId, organizationId);
    const ids = vehicles.map((v) => v._id!).filter((id): id is string => Boolean(id));
    if (filters.vehicleId) {
      return ids.includes(filters.vehicleId) ? { vehicleId: filters.vehicleId } : { vehicleIds: [] };
    }
    return { vehicleIds: ids };
  }
  if (filters.vehicleId) return { vehicleId: filters.vehicleId };
  return {};
}

/** Command Centre's own date-range guard -- bounds every bounded-fetch
 *  Node-reduction path in getCommandCentreSummary to a scale this
 *  codebase's existing precedent (100000-row `limit`) comfortably
 *  covers for one tenant's transport-cost volume. Reversible: raise this
 *  (and the 100000 limits alongside it) if a tenant's real data ever
 *  approaches it -- see bucketStartFor's own doc comment for the real
 *  fix if that happens. */
export const MAX_COMMAND_CENTRE_RANGE_DAYS = 400;

/**
 * A sheet family's raw column names differ (see
 * shared/types/transport-cost.types.ts's ThirdPartyImportRow /
 * VansalesImportRow) -- this is the one place that knows which raw key
 * means "date"/"registration"/"transporter"/"amount" for a given
 * family, so getDataQualityExceptions itself never has to branch on
 * sheetFamily to read a cell.
 */
/**
 * WIDENED, Command Centre Slice A0. Previously branched only on
 * `sheetFamily === 'third-party'`, with every other family --
 * 'vansales' AND, incorrectly, 'swift'/'depot-sto' too -- falling
 * through to the SAME 'vansales'-shaped fallback (rawRow.truck /
 * rawRow.total). That was never wrong in production only because
 * Swift never posts (every row is `unresolved-vehicle-identity`, so
 * getDataQualityExceptions' rejected/duplicate paths were the only way
 * a Swift rawRow could reach this function, and none had before this
 * change) and Depot STO's 'stock-transfer' category was outside this
 * report's COST_CATEGORY scope entirely. Both stop being true the
 * moment the Command Centre widens that scope (see
 * TRANSPORT_COST_CATEGORIES below) -- at that point a rejected/
 * duplicate Depot STO or Swift row becomes reachable through
 * getDataQualityExceptions and this function must label its raw fields
 * correctly rather than mislabel them as Vansales's.
 *
 * Field names below are read directly from each family's own
 * `*ImportRow` command shape (modules/transport-cost/commands/
 * import-transport-cost.command.ts) -- the same keys
 * ImportModal.buildRecordsForSubmission actually forwards, since a
 * rejected/duplicate row never reaches TransportCostSourceRecord's own
 * normalized fields (date/registration/transporterRaw/amount) and this
 * function exists precisely to read the raw, as-uploaded row instead.
 */
function extractRawDisplayFields(
  sheetFamily: TransportCostSheetFamily,
  rawRow: Record<string, unknown>
): { rawDate?: string; rawRegistration?: string; rawTransporter?: string; amount?: string } {
  const asString = (v: unknown): string | undefined => (v === undefined || v === null || v === '' ? undefined : String(v));

  if (sheetFamily === 'third-party') {
    return {
      rawDate: asString(rawRow.date),
      rawRegistration: asString(rawRow.registration),
      rawTransporter: asString(rawRow.transporter),
      amount: asString(rawRow.amount),
    };
  }

  if (sheetFamily === 'vansales') {
    // No per-row date column (see TransportCostSourceRecord.rawDate's
    // own header note); 'truck' holds the transporter name, not
    // 'transporter' (see the audit's Family 4 terminology-trap note),
    // and the source's own TOTAL column is the authoritative amount,
    // not a re-summed weekly figure.
    return {
      rawDate: undefined,
      rawRegistration: asString(rawRow.registration),
      rawTransporter: asString(rawRow.truck),
      amount: asString(rawRow.total),
    };
  }

  if (sheetFamily === 'swift') {
    // Swift's source data structurally has no registration/transporter
    // column at all (SwiftImportRow, and TransportCostSheetFamily's own
    // doc comment) -- rawRegistration/rawTransporter stay undefined,
    // never fabricated from an unrelated column like receiversName.
    // 'Cons. date' is the row's own date; 'Total(Incl)' is the posted
    // amount (see SwiftImportRow.totalIncl's doc comment for why the
    // all-in figure is used over Total(Excl)).
    return {
      rawDate: asString(rawRow.consDate),
      rawRegistration: undefined,
      rawTransporter: undefined,
      amount: asString(rawRow.totalIncl),
    };
  }

  // 'depot-sto' -- DepotStoImportRow already maps every month's
  // differently-named columns (DATE, "Truck registration no"/"REG",
  // Transporter, Amount/COSTS/COST) onto these four canonical keys at
  // import time (see DEPOT_STO_DECISION.md), so no per-shape branching
  // is needed here the way the six real sheets needed it at import.
  return {
    rawDate: asString(rawRow.date),
    rawRegistration: asString(rawRow.registration),
    rawTransporter: asString(rawRow.transporter),
    amount: asString(rawRow.amount),
  };
}

export class TransportCostReportService {
  constructor(
    private readonly vehicleRepo: ContractedVehicleRepository = contractedVehicleRepository,
    private readonly partnerRepo: TransportPartnerRepository = transportPartnerRepository,
    private readonly settingsService: FinanceSettingsService = financeSettingsService,
    private readonly ledgerRepo: AllocationLedgerRepository = allocationLedgerRepository,
    private readonly sourceRepo: TransportCostSourceRecordRepository = transportCostSourceRecordRepository,
    private readonly exceptionRepo: TransportCostImportExceptionRepository = transportCostImportExceptionRepository
  ) {}

  /**
   * The full Stream -> Vehicle report for one period. periodStart/
   * periodEnd use the ledger's own FULLY-CONTAINED semantics (see
   * AllocationLedgerRepository's header) -- consistent with every other
   * total this platform reports, including the one a customer may
   * already be reconciling against their own GL.
   */
  async getAllocationReport(
    context: TenantContext,
    periodStart: Date,
    periodEnd: Date
  ): Promise<TransportCostAllocationReport> {
    if (periodEnd < periodStart) {
      throw new ValidationError('periodEnd cannot be earlier than periodStart.');
    }

    const [totals, companyTotals, vehicles, settings, pendingCount, loadSummary] = await Promise.all([
      this.ledgerRepo.getNetTotalsByVehicleForCategory(COST_CATEGORY, periodStart, periodEnd, context),
      this.ledgerRepo.getNetTotalsByCompanyAcrossVehicles(COST_CATEGORY, periodStart, periodEnd, context),
      this.vehicleRepo.findAllConfirmed(context.organizationId),
      this.settingsService.resolve(context.organizationId),
      this.sourceRepo.countPendingAmount(periodStart, periodEnd, context),
      this.sourceRepo.getLoadSummaryInScope(periodStart, periodEnd, context),
    ]);

    const vehicleById = new Map(vehicles.map((v) => [v._id!, v]));
    const partnerIds = Array.from(new Set(vehicles.map((v) => v.transporterPartnerId)));
    const partners = await Promise.all(partnerIds.map((id) => this.partnerRepo.findById(id, context.organizationId)));
    const partnerById = new Map(partners.filter((p): p is NonNullable<typeof p> => Boolean(p)).map((p) => [p._id!, p]));

    const currencies = Array.from(new Set(totals.map((t) => t.reportingCurrency)));
    const mixed = currencies.length > 1;

    const byVehicle: VehicleGroupTotal[] = totals.map((t) => {
      const vehicle = vehicleById.get(t.vehicleId);
      const partner = vehicle ? partnerById.get(vehicle.transporterPartnerId) : undefined;
      return {
        contractedVehicleId: t.vehicleId,
        registration: vehicle?.registration ?? '(unresolved vehicle)',
        transporterName: partner?.canonicalName ?? '(unresolved transporter)',
        businessStream: vehicle?.businessStream ?? UNATTRIBUTED,
        reportingCurrency: t.reportingCurrency,
        netReportingAmount: roundCurrency(t.netReportingAmount),
        postingCount: t.postingCount,
      };
    });

    const streamMap = new Map<string, StreamGroupTotal>();
    for (const row of byVehicle) {
      const key = `${row.businessStream}\u0000${row.reportingCurrency}`;
      const existing = streamMap.get(key);
      if (existing) {
        existing.netReportingAmount = roundCurrency(existing.netReportingAmount + row.netReportingAmount);
        existing.postingCount += row.postingCount;
        existing.vehicleCount += 1;
      } else {
        streamMap.set(key, {
          businessStream: row.businessStream,
          reportingCurrency: row.reportingCurrency,
          netReportingAmount: row.netReportingAmount,
          postingCount: row.postingCount,
          vehicleCount: 1,
        });
      }
    }

    const byCompany: CompanyGroupTotal[] = companyTotals.map((t) => {
      const key = t.costFacingCompany ?? UNATTRIBUTED;
      return {
        costFacingCompany: key,
        label: costFacingCompanyLabel(t.costFacingCompany),
        reportingCurrency: t.reportingCurrency,
        netReportingAmount: roundCurrency(t.netReportingAmount),
        postingCount: t.postingCount,
      };
    });

    return {
      periodStart,
      periodEnd,
      reportingCurrency: currencies[0] ?? settings.reportingCurrency,
      byBusinessStream: Array.from(streamMap.values()),
      byCompany,
      byVehicle,
      ...(mixed ? { mixedReportingCurrencies: currencies } : {}),
      pending: {
        pendingSourceRecordCount: pendingCount,
        hasPendingAmounts: pendingCount > 0,
      },
      loadSummary,
    };
  }

  /**
   * Stream/Vehicle -> individual postings, the report's bottom drill-
   * down level. ContractedVehicle is organization-level (no orgUnitId --
   * see its type's header), so the existence check below is tenant-only,
   * unlike AllocationService.resolveVehicleInScope's additional org-unit
   * membership check; the POSTINGS themselves are still org-unit scoped
   * via findByVehicleInScope's TenantContext parameter, so a caller
   * cannot see postings for a vehicle outside their own visible org
   * units even though the vehicle record itself is org-wide.
   */
  async getPostingsForVehicle(
    context: TenantContext,
    contractedVehicleId: string,
    periodStart: Date,
    periodEnd: Date
  ): Promise<PostingDrillDown> {
    const vehicle = await this.vehicleRepo.findById(contractedVehicleId, context.organizationId);
    if (!vehicle) {
      throw new NotFoundError(`Contracted vehicle "${contractedVehicleId}" not found.`);
    }
    const partner = await this.partnerRepo.findById(vehicle.transporterPartnerId, context.organizationId);

    const postings = await this.ledgerRepo.findByVehicleInScope(contractedVehicleId, context, {
      costCategory: COST_CATEGORY,
      periodStart,
      periodEnd,
    });

    return {
      contractedVehicleId,
      registration: vehicle.registration,
      transporterName: partner?.canonicalName ?? '(unresolved transporter)',
      businessStream: vehicle.businessStream ?? UNATTRIBUTED,
      postings,
    };
  }

  /** The month picker's own data source -- see AllocationLedgerRepository.getDistinctPostedMonths. */
  async getAvailableMonths(context: TenantContext): Promise<Date[]> {
    return this.ledgerRepo.getDistinctPostedMonths(COST_CATEGORY, context);
  }

  /**
   * ADDED, item 6. "Add a data-quality exceptions export ... so the
   * four year-typo rows and the rejected rows are findable without
   * reading the README."
   *
   * ---------------------------------------------------------------
   * WHY THIS IS SCOPED BY IMPORT BATCH, NOT BY THE EXCEPTION'S OWN DATE
   * ---------------------------------------------------------------
   * A rejected row's own date is frequently exactly the thing that got
   * it rejected (unparseable, missing) -- filtering rejections by their
   * own `date` would silently drop the very rows this report exists to
   * surface. Instead: find every import batch that produced at least
   * one POSTING inside the requested period (a batch's postings share
   * one source file and one import run, so "this batch touched
   * January 2026" is a stable, unambiguous membership test even when
   * an individual row's own date is broken), then return every
   * exception AND every outlying posting belonging to those same
   * batches, regardless of that row's own date.
   *
   * Three kinds of finding, always returned together:
   *   'rejected'       -- persisted TransportCostImportException rows,
   *                        kind 'rejected'. Never made it into
   *                        tbltransportcostsourcerecords at all.
   *   'duplicate'       -- persisted TransportCostImportException rows,
   *                        kind 'duplicate'. Same.
   *   'period-outlier'  -- NOT persisted anywhere; computed here, at
   *                        query time, from postings the SAME batches
   *                        already produced whose own periodStart falls
   *                        outside [periodStart, periodEnd] -- the
   *                        general form of the January 2026 year-typo
   *                        finding (rows 93/96/97/105, "31.01.25" on a
   *                        sheet named "JAN-26"). This is a property of
   *                        an EXISTING posting, not a row that failed
   *                        to become one, so persisting a second copy
   *                        of it here would be exactly the kind of
   *                        derived-fact duplication this ledger's
   *                        append-only design exists to avoid.
   */
  async getDataQualityExceptions(
    context: TenantContext,
    periodStart: Date,
    periodEnd: Date,
    /**
     * WIDENED, Command Centre Slice A/C. Was implicitly pinned to
     * COST_CATEGORY ('third-party-transport' only) -- the O4 report
     * screen's own scope. Defaulted to COST_CATEGORY so that screen's
     * existing behaviour (and its existing tests) are byte-for-byte
     * unchanged; getCommandCentreSummary below passes
     * TRANSPORT_COST_CATEGORIES instead, so Vansales/Swift/Depot STO
     * batches are discoverable through this same method rather than a
     * second, parallel exceptions query.
     */
    costCategoryScope: AllocationCostCategory | AllocationCostCategory[] = COST_CATEGORY
  ): Promise<DataQualityExceptionsReport> {
    if (periodEnd < periodStart) {
      throw new ValidationError('periodEnd cannot be earlier than periodStart.');
    }

    // Step 1: which batches produced a posting actually inside this period?
    const inPeriodPostings = await this.ledgerRepo.findRawByCategoryInScope(
      costCategoryScope,
      periodStart,
      periodEnd,
      context
    );
    const inPeriodSourceIds = Array.from(new Set(inPeriodPostings.map((p) => p.sourceId)));
    const inPeriodSourceRecords = await this.sourceRepo.findManyByIds(inPeriodSourceIds, context);
    const batchIds = Array.from(new Set(inPeriodSourceRecords.map((r) => r.importBatchId)));

    if (batchIds.length === 0) {
      return { periodStart, periodEnd, rejected: [], duplicates: [], periodOutliers: [] };
    }

    // Step 2: persisted rejected/duplicate exceptions for those batches.
    const exceptions = await this.exceptionRepo.findByImportBatchIds(batchIds, context);
    const toExceptionRow = (e: TransportCostImportException): DataQualityExceptionRow => {
      const raw = extractRawDisplayFields(e.sheetFamily, e.rawRow);
      return {
        kind: e.kind,
        importBatchId: e.importBatchId,
        sourceFileName: e.sourceFileName,
        sourceRowNumber: e.sourceRowNumber,
        ...raw,
        reason: e.reason,
        column: e.column,
        invalidValue: e.invalidValue,
      };
    };
    const rejected = exceptions.filter((e) => e.kind === 'rejected').map(toExceptionRow);
    const duplicates = exceptions.filter((e) => e.kind === 'duplicate').map(toExceptionRow);

    // Step 3: period outliers -- every posting the same batches produced,
    // regardless of period, minus the ones already known to be in-period.
    const batchSourceRecords = await this.sourceRepo.findByImportBatchIds(batchIds, context);
    const batchSourceIds = batchSourceRecords.map((r) => r._id!);
    const sourceById = new Map(batchSourceRecords.map((r) => [r._id!, r]));
    const allBatchPostings = await this.ledgerRepo.findBySourceIdsForCategory(batchSourceIds, costCategoryScope, context);
    const inPeriodPostingIds = new Set(inPeriodPostings.map((p) => p._id));

    const periodOutliers: DataQualityExceptionRow[] = allBatchPostings
      .filter((p) => !inPeriodPostingIds.has(p._id))
      .map((p) => {
        const src = sourceById.get(p.sourceId);
        const postedFrom = new Date(p.periodStart).toISOString().slice(0, 10);
        const windowFrom = periodStart.toISOString().slice(0, 10);
        const windowTo = periodEnd.toISOString().slice(0, 10);
        return {
          kind: 'period-outlier' as const,
          importBatchId: src?.importBatchId ?? '(unresolved source record)',
          sourceFileName: src?.sourceFileName ?? '(unresolved source record)',
          sourceRowNumber: src?.sourceRowNumber ?? 0,
          rawDate: src?.rawDate,
          rawRegistration: src?.registrationRaw,
          rawTransporter: src?.transporterRaw,
          amount: p.amount !== undefined && p.amount !== null ? String(p.amount) : undefined,
          reason: `Posted for ${postedFrom}, outside the requested ${windowFrom}..${windowTo} window -- check this row's raw date for a possible entry error.`,
        };
      });

    return { periodStart, periodEnd, rejected, duplicates, periodOutliers };
  }

  /**
   * COMMAND CENTRE SUMMARY -- Slice A (aggregation/time-series) + B
   * (evidence is reached via the existing getPostingsForVehicle /
   * getDataQualityExceptions drill-downs, extended, not duplicated) + C
   * (the `dataQuality` block). ONE response for the whole dashboard --
   * every KPI card, every chart, and the trust panel -- so the frontend
   * never issues one request per widget (the milestone's own
   * "PERFORMANCE" requirement).
   *
   * -----------------------------------------------------------------
   * FINANCIAL SOURCE OF TRUTH
   * -----------------------------------------------------------------
   * `totals`/`byCompany`/`byCategory`/`byVehicle`/`byTransporter`/
   * `byDestination`/`byCustomer`/`timeSeries` are ALL built from
   * AllocationLedgerRepository reads only -- never from
   * TransportCostSourceRecordRepository.amount. `operational` and
   * `dataQuality` are the opposite: built from source records only,
   * never from the ledger, per the milestone's own "financial totals
   * from the ledger, operational metrics from source records" rule.
   *
   * -----------------------------------------------------------------
   * FILTER-VS-BREAKDOWN SEMANTICS (the "critical correctness
   * requirement" the milestone calls out explicitly)
   * -----------------------------------------------------------------
   * `destinationTown`/`customerName` as an ACTIVE FILTER narrow which
   * operations are considered using OR-over-lines (a record matches if
   * its flat field OR ANY line names the given customer/destination --
   * see matchesDestinationCustomerFilter). This is safe: filtering only
   * removes non-matching records from consideration; since each source
   * record still produces at most one ledger posting (Slice 2's own
   * one-parent-one-cost-one-posting invariant, unchanged by this
   * milestone), narrowing which records are considered can never
   * multiply a financial figure.
   *
   * `byDestination`/`byCustomer` as a BREAKDOWN/CHART instead bucket by
   * the record's PRIMARY (flat, line-1) field only -- see
   * destinationBucketKey/customerBucketKey's own header for why: bucketing
   * by every distinct line value would let one operation's single cost
   * contribute to MULTIPLE bars, so the bars would sum to more than
   * `totals`. This is deliberately a narrower, honest view ("cost by
   * PRIMARY destination/customer") rather than a wrong one; a future
   * per-line cost-split feature is explicitly out of scope (no defined,
   * client-confirmed rule exists for splitting one parent cost across
   * lines with different destinations -- inventing one would violate
   * item 17, "do not invent calculations").
   *
   * Every OTHER filter (company/category/vehicle/transporter) narrows
   * every card/chart/the time series/the operational counts identically
   * -- see resolveVehicleScope for how a vehicle + transporter filter
   * combine, and buildVehicleConstraint (ledger repository) for why that
   * combination is computed here, once, rather than left to chance at
   * the repository layer.
   *
   * -----------------------------------------------------------------
   * MULTI-LINE PARENT COUNTING
   * -----------------------------------------------------------------
   * Every dimension above reads AllocationPosting rows, which already
   * carry the Slice 2 invariant "one parent operation -> one posting" --
   * so a multi-line operation is structurally incapable of appearing
   * twice or contributing twice to any total here, regardless of how
   * many of its lines match an active filter. `operational` (which DOES
   * read multi-line detail, via getLoadSummaryInScope) reports
   * `totalOperations` (one per source record, however many lines) and
   * `totalLines` (the load count) SEPARATELY, exactly like
   * getAllocationReport's own loadSummary -- never blended into each
   * other or into a financial figure.
   */
  async getCommandCentreSummary(
    context: TenantContext,
    periodStart: Date,
    periodEnd: Date,
    granularity: CommandCentreGranularity,
    filters: CommandCentreFilters = {}
  ): Promise<CommandCentreSummary> {
    // Steps 1-3 (validation, vehicle-scope resolution, the one bounded
    // raw-posting fetch, the destination/customer filter, and the
    // vehicle/partner display-name join) now live in fetchScopedPostings
    // -- GAP-CLOSURE PASS, Objective 4 -- so getCommandCentreDrillDown
    // below can reuse the exact same scoped-postings computation this
    // method's bars/cards are built from, rather than a second,
    // independently-maintained copy that could silently drift and make
    // a drill-down disagree with the card that opened it.
    const { matchedPostings, sourceById, vehicleById, partnerById, baseVehicleScope } = await this.fetchScopedPostings(
      context,
      periodStart,
      periodEnd,
      filters
    );

    // Step 4: EVERY dimension below -- totals, byCompany, byCategory,
    // byVehicle, byTransporter, byDestination, byCustomer, timeSeries --
    // is reduced from the SAME `matchedPostings` array in ONE pass, not
    // from a separate $group query per dimension.
    //
    // THIS IS DELIBERATE, NOT MERELY AN OPTIMISATION. An earlier version
    // of this method ran totals/byCompany/byCategory/byVehicle as
    // separate AllocationLedgerRepository.getNetTotalsGrouped() calls,
    // narrowed by a vehicle-id SET derived from matchedPostings whenever
    // a destination/customer filter was active. That is wrong the
    // moment two different source records share a vehicle and only one
    // of them matches the filter: the vehicle-id proxy cannot
    // distinguish "this vehicle's OTHER posting, for a different
    // customer" from "this vehicle's posting for the filtered customer"
    // -- both share the same vehicleId, so a vehicleId-based $in filter
    // includes both, silently re-including cost that was supposed to be
    // excluded (caught by this file's own
    // transport-cost-command-centre.service.spec.ts). Reducing over
    // `matchedPostings` directly has no such gap: that array is ALREADY
    // the exact, correct set of postings in scope (every filter applied,
    // including the join-dependent destination/customer one), so every
    // card and chart below reads from precisely the same source of
    // truth, by construction, rather than by keeping several
    // independently-filtered queries in sync. `getNetTotalsGrouped`
    // itself is kept (see its own header) as a generically useful,
    // independently-tested aggregation for a future caller that does
    // NOT need the destination/customer join -- just no longer called
    // from this method.
    const totalsMap = new Map<string, CommandCentreDimensionTotal>();
    const companyMap = new Map<string, CommandCentreDimensionTotal>();
    const categoryMap = new Map<string, CommandCentreDimensionTotal>();
    const vehicleMap = new Map<string, CommandCentreDimensionTotal>();
    const transporterMap = new Map<string, CommandCentreDimensionTotal>();
    const destinationMap = new Map<string, CommandCentreDimensionTotal>();
    const customerMap = new Map<string, CommandCentreDimensionTotal>();
    const timeSeriesMap = new Map<string, CommandCentreTimeSeriesBucket>();

    const accumulate = (map: Map<string, CommandCentreDimensionTotal>, key: string, label: string, currency: string, amount: number) => {
      const mapKey = `${key}\u0000${currency}`;
      const existing = map.get(mapKey);
      if (existing) {
        existing.netReportingAmount = roundCurrency(existing.netReportingAmount + amount);
        existing.postingCount += 1;
      } else {
        map.set(mapKey, { key, label, reportingCurrency: currency, netReportingAmount: amount, postingCount: 1 });
      }
    };

    for (const posting of matchedPostings) {
      const record = sourceById.get(posting.sourceId);
      const amount = roundCurrency(posting.reportingAmount);
      const currency = posting.reportingCurrency;

      accumulate(totalsMap, 'total', 'Total', currency, amount);

      const companyKey = posting.costFacingCompany ?? 'unattributed';
      accumulate(companyMap, companyKey, costFacingCompanyLabel(posting.costFacingCompany ?? undefined), currency, amount);

      const categoryKey = posting.costCategory;
      accumulate(categoryMap, categoryKey, CATEGORY_LABELS[categoryKey] ?? categoryKey, currency, amount);

      const vehicle = vehicleById.get(posting.vehicleId);
      accumulate(vehicleMap, posting.vehicleId, vehicle?.registration ?? '(unresolved vehicle)', currency, amount);

      const transporterPartnerId = vehicle?.transporterPartnerId;
      const partner = transporterPartnerId ? partnerById.get(transporterPartnerId) : undefined;
      accumulate(transporterMap, transporterPartnerId ?? UNAVAILABLE, partner?.canonicalName ?? '(unresolved transporter)', currency, amount);

      const destKey = destinationBucketKey(record);
      accumulate(destinationMap, destKey, bucketLabel(destKey), currency, amount);

      const custKey = customerBucketKey(record);
      accumulate(customerMap, custKey, bucketLabel(custKey), currency, amount);

      const bucketStart = bucketStartFor(new Date(posting.periodStart), granularity);
      const tsMapKey = `${bucketStart.toISOString()}\u0000${currency}`;
      const tsExisting = timeSeriesMap.get(tsMapKey);
      if (tsExisting) {
        tsExisting.netReportingAmount = roundCurrency(tsExisting.netReportingAmount + amount);
        tsExisting.postingCount += 1;
      } else {
        timeSeriesMap.set(tsMapKey, {
          bucketStart,
          bucketEnd: bucketEndFor(bucketStart, granularity),
          reportingCurrency: currency,
          netReportingAmount: amount,
          postingCount: 1,
        });
      }
    }

    const timeSeries = Array.from(timeSeriesMap.values()).sort((a, b) => a.bucketStart.getTime() - b.bucketStart.getTime());
    const totals = Array.from(totalsMap.values());
    const byCompany = Array.from(companyMap.values());
    const byCategory = Array.from(categoryMap.values());
    const byVehicle = Array.from(vehicleMap.values());
    const byTransporter = Array.from(transporterMap.values());
    const currencies = Array.from(new Set(totals.map((t) => t.reportingCurrency)));
    const mixed = currencies.length > 1;

    // Step 5: operational metrics -- SOURCE RECORDS only, never the
    // ledger. Widened across all four sheet families (unlike
    // getAllocationReport's own loadSummary, which stays pinned to
    // 'third-party' for that existing screen's stability). Uses
    // `baseVehicleScope` (the transporter/vehicle filter only) rather
    // than anything derived from `matchedPostings`: getLoadSummaryInScope
    // reads TransportCostSourceRecord directly and applies its OWN
    // destinationTown/customerName matching (passed straight through
    // below), so narrowing its vehicle scope by which vehicles happen to
    // have a LEDGER posting would incorrectly hide a vehicle's pending
    // (never-posted) operations whenever no vehicle/transporter filter
    // was actually requested.
    const operationalVehicleIds = baseVehicleScope.vehicleId ? [baseVehicleScope.vehicleId] : baseVehicleScope.vehicleIds;
    const [operational, pendingSourceRecordCount, dataQualityBreakdown, exceptions] = await Promise.all([
      this.sourceRepo.getLoadSummaryInScope(periodStart, periodEnd, context, ['third-party', 'vansales', 'swift', 'depot-sto'], {
        costFacingCompany: filters.costFacingCompany,
        contractedVehicleIds: operationalVehicleIds,
        destinationTown: filters.destinationTown,
        customerName: filters.customerName,
      }),
      this.sourceRepo.countPendingAmount(periodStart, periodEnd, context, ['third-party', 'vansales', 'swift', 'depot-sto']),
      this.sourceRepo.getDataQualityBreakdown(periodStart, periodEnd, context),
      this.getDataQualityExceptions(context, periodStart, periodEnd, TRANSPORT_COST_CATEGORIES),
    ]);

    const dataQuality: CommandCentreDataQuality = {
      pendingAmountCount: pendingSourceRecordCount,
      rejectedCount: exceptions.rejected.length,
      duplicateCount: exceptions.duplicates.length,
      periodOutlierCount: exceptions.periodOutliers.length,
      missingCostFacingCompany: dataQualityBreakdown.missingCostFacingCompany,
      missingRegistration: dataQualityBreakdown.missingRegistration,
      unresolvedVehicle: dataQualityBreakdown.unresolvedVehicle,
      vehicleNotApplicable: dataQualityBreakdown.vehicleNotApplicable,
      unresolvedTransporter: dataQualityBreakdown.unresolvedTransporter,
      missingCustomer: dataQualityBreakdown.missingCustomer,
      missingDestination: dataQualityBreakdown.missingDestination,
      destinationNotApplicable: dataQualityBreakdown.destinationNotApplicable,
      missingTonnage: dataQualityBreakdown.missingTonnage,
    };

    return {
      periodStart,
      periodEnd,
      granularity,
      filters,
      totals,
      ...(mixed ? { mixedReportingCurrencies: currencies } : {}),
      byCompany,
      byCategory,
      byVehicle,
      byTransporter,
      byDestination: Array.from(destinationMap.values()),
      byCustomer: Array.from(customerMap.values()),
      timeSeries,
      operational,
      dataQuality,
      pending: {
        pendingSourceRecordCount,
        hasPendingAmounts: pendingSourceRecordCount > 0,
      },
    };
  }

  /**
   * GAP-CLOSURE PASS, Objective 4. Validation + Steps 1-3 of
   * getCommandCentreSummary, extracted verbatim (not re-derived) so both
   * that method and getCommandCentreDrillDown below read from IDENTICAL
   * scoped-postings logic. Also returns `baseVehicleScope`, which
   * getCommandCentreSummary's own Step 5 (operational metrics) still
   * needs directly.
   */
  private async fetchScopedPostings(
    context: TenantContext,
    periodStart: Date,
    periodEnd: Date,
    filters: CommandCentreFilters
  ): Promise<{
    matchedPostings: AllocationPosting[];
    sourceById: Map<string, TransportCostSourceRecord>;
    vehicleById: Map<string, ContractedVehicle>;
    partnerById: Map<string, TransportPartner>;
    baseVehicleScope: { vehicleId?: string; vehicleIds?: string[] };
  }> {
    if (periodEnd < periodStart) {
      throw new ValidationError('periodEnd cannot be earlier than periodStart.');
    }
    const rangeDays = (periodEnd.getTime() - periodStart.getTime()) / (24 * 60 * 60 * 1000);
    if (rangeDays > MAX_COMMAND_CENTRE_RANGE_DAYS) {
      throw new ValidationError(
        `The requested range spans more than ${MAX_COMMAND_CENTRE_RANGE_DAYS} days -- narrow the date range for the Command Centre.`
      );
    }
    if (filters.costCategory && !TRANSPORT_COST_CATEGORIES.includes(filters.costCategory)) {
      throw new ValidationError(
        `"${filters.costCategory}" is not a transport-cost category. Use one of: ${TRANSPORT_COST_CATEGORIES.join(', ')}.`
      );
    }

    // Step 1: resolve transporter/vehicle filters to at most one of {vehicleId, vehicleIds}.
    const baseVehicleScope = await resolveVehicleScope(filters, this.vehicleRepo, context.organizationId);

    // Step 2: ONE bounded raw-posting fetch, scoped by everything Mongo
    // can apply directly (company/category/vehicle scope), reused for
    // BOTH the destination/customer breakdown AND the time series --
    // never two separate fetches for two charts that need the same rows.
    const rawPostings = await this.ledgerRepo.findRawByCategoryInScope(
      filters.costCategory ?? TRANSPORT_COST_CATEGORIES,
      periodStart,
      periodEnd,
      context,
      { costFacingCompany: filters.costFacingCompany, ...baseVehicleScope }
    );
    const sourceIds = Array.from(new Set(rawPostings.map((p) => p.sourceId)));
    const sourceRecords = sourceIds.length > 0 ? await this.sourceRepo.findManyByIds(sourceIds, context) : [];
    const sourceById = new Map(sourceRecords.map((r) => [r._id!, r]));

    const destinationCustomerFilterActive = Boolean(
      (filters.destinationTown && filters.destinationTown.trim()) || (filters.customerName && filters.customerName.trim())
    );
    const matchedPostings = destinationCustomerFilterActive
      ? rawPostings.filter((p) => matchesDestinationCustomerFilter(sourceById.get(p.sourceId), filters.destinationTown, filters.customerName))
      : rawPostings;

    // Step 3: resolve display names for byVehicle/byTransporter -- same
    // vehicle+partner join getAllocationReport already does.
    const vehicles = await this.vehicleRepo.findAllConfirmed(context.organizationId);
    const vehicleById = new Map(vehicles.map((v) => [v._id!, v]));
    const partnerIds = Array.from(new Set(vehicles.map((v) => v.transporterPartnerId)));
    const partners = await Promise.all(partnerIds.map((id) => this.partnerRepo.findById(id, context.organizationId)));
    const partnerById = new Map(partners.filter((p): p is NonNullable<typeof p> => Boolean(p)).map((p) => [p._id!, p]));

    return { matchedPostings, sourceById, vehicleById, partnerById, baseVehicleScope };
  }

  /**
   * GAP-CLOSURE PASS, Objective 4 ("Command Centre Slice B/C" --
   * drill-down/evidence). Users move from a Command Centre metric
   * (a bar in byCompany/byCategory/byVehicle/byTransporter/
   * byDestination/byCustomer, or a point on the trend chart) into the
   * exact postings/operations behind it.
   *
   * `dimensionConstraint` omitted entirely -> every posting in the
   * requested period+filters (the shape a trend-point click wants: "show
   * me everything behind this day/week/month bar", not one dimension
   * value). `dimensionConstraint` supplied -> further narrowed to
   * postings whose `dimensionKeyFor(dimension, ...)` equals `key` --
   * EXACTLY the same key a bar's own `CommandCentreDimensionTotal.key`
   * carries, computed by the same function the summary's own accumulate
   * loop effectively uses (see dimensionKeyFor's header) -- so a
   * frontend that opens this from "byTransporter row with key X" is
   * guaranteed to see only (and all of) the postings that bar's own
   * total was built from.
   *
   * NEVER double-counts a multi-line operation: like
   * getCommandCentreSummary, this reads AllocationPosting rows directly
   * (one per source record, per the Slice 2 invariant), never
   * `lines[]`, so a multi-line operation contributes at most one row
   * here regardless of how many lines it has.
   *
   * `totals` is reduced over the FULL constrained set (every matching
   * posting), not just the returned/truncated `rows` page, so it always
   * reconciles to the bar/card that was clicked to open this drill-down
   * even when the row list itself is capped at
   * COMMAND_CENTRE_DRILL_DOWN_ROW_LIMIT for the dialog to render.
   */
  async getCommandCentreDrillDown(
    context: TenantContext,
    periodStart: Date,
    periodEnd: Date,
    filters: CommandCentreFilters = {},
    dimensionConstraint?: { dimension: CommandCentreDrillDownDimension; key: string }
  ): Promise<CommandCentreDrillDownResult> {
    const { matchedPostings, sourceById, vehicleById, partnerById } = await this.fetchScopedPostings(
      context,
      periodStart,
      periodEnd,
      filters
    );

    const constrained = dimensionConstraint
      ? matchedPostings.filter(
          (p) => dimensionKeyFor(dimensionConstraint.dimension, p, sourceById.get(p.sourceId), vehicleById) === dimensionConstraint.key
        )
      : matchedPostings;

    // Newest first -- the same "most recent evidence first" convention
    // an operator reviewing a metric would expect, and matches
    // TransportCostImportPage's own default sort.
    const sorted = [...constrained].sort((a, b) => new Date(b.periodStart).getTime() - new Date(a.periodStart).getTime());
    const truncated = sorted.length > COMMAND_CENTRE_DRILL_DOWN_ROW_LIMIT;
    const page = sorted.slice(0, COMMAND_CENTRE_DRILL_DOWN_ROW_LIMIT);

    const rows: CommandCentreDrillDownRow[] = page.map((posting) => {
      const record = sourceById.get(posting.sourceId);
      const vehicle = vehicleById.get(posting.vehicleId);
      const partner = vehicle?.transporterPartnerId ? partnerById.get(vehicle.transporterPartnerId) : undefined;
      return {
        sourceRecordId: posting.sourceId,
        postingId: posting._id!,
        date: posting.periodStart,
        costFacingCompany: posting.costFacingCompany ?? null,
        costCategory: posting.costCategory,
        vehicleId: posting.vehicleId,
        registration: vehicle?.registration ?? '(unresolved vehicle)',
        transporterPartnerId: vehicle?.transporterPartnerId,
        transporterName: partner?.canonicalName ?? '(unresolved transporter)',
        destinationTown: record?.destinationTown,
        customerName: record?.customerName,
        sheetFamily: record?.sheetFamily,
        reportingAmount: roundCurrency(posting.reportingAmount),
        reportingCurrency: posting.reportingCurrency,
      };
    });

    // Reduced over `constrained` (the FULL matching set), never `page` --
    // see this method's own header for why.
    const totalsMap = new Map<string, CommandCentreDimensionTotal>();
    for (const posting of constrained) {
      const amount = roundCurrency(posting.reportingAmount);
      const currency = posting.reportingCurrency;
      const mapKey = `total\u0000${currency}`;
      const existing = totalsMap.get(mapKey);
      if (existing) {
        existing.netReportingAmount = roundCurrency(existing.netReportingAmount + amount);
        existing.postingCount += 1;
      } else {
        totalsMap.set(mapKey, { key: 'total', label: 'Total', reportingCurrency: currency, netReportingAmount: amount, postingCount: 1 });
      }
    }

    let label: string | undefined;
    if (dimensionConstraint) {
      const sample = constrained[0];
      const sampleRecord = sample ? sourceById.get(sample.sourceId) : undefined;
      switch (dimensionConstraint.dimension) {
        case 'company':
          label = costFacingCompanyLabel(dimensionConstraint.key);
          break;
        case 'category':
          label = CATEGORY_LABELS[dimensionConstraint.key as AllocationCostCategory] ?? dimensionConstraint.key;
          break;
        case 'vehicle':
          label = vehicleById.get(dimensionConstraint.key)?.registration ?? '(unresolved vehicle)';
          break;
        case 'transporter':
          label = partnerById.get(dimensionConstraint.key)?.canonicalName ?? '(unresolved transporter)';
          break;
        case 'destination':
          label = bucketLabel(destinationBucketKey(sampleRecord));
          break;
        case 'customer':
          label = bucketLabel(customerBucketKey(sampleRecord));
          break;
      }
    }

    return {
      dimension: dimensionConstraint?.dimension,
      key: dimensionConstraint?.key,
      label,
      periodStart,
      periodEnd,
      filters,
      totals: Array.from(totalsMap.values()),
      rows,
      rowCount: constrained.length,
      truncated,
    };
  }

  /**
   * GAP-CLOSURE PASS, Objective 4 ("navigation from exception ->
   * operation/source record -> review/correct where existing workflows
   * support it"). The evidence rows behind one
   * CommandCentreDataQuality count -- see
   * TransportCostSourceRecordRepository.findByDataQualityIssue's own
   * header for why this can never disagree with the count itself.
   * Deliberately thin: this method does no additional classification of
   * its own, it only shapes findByDataQualityIssue's rows for the API/
   * frontend and applies the same row cap every other drill-down here
   * uses.
   */
  async getDataQualityIssueEvidence(
    context: TenantContext,
    issue: DataQualityIssueKind,
    periodStart: Date,
    periodEnd: Date
  ): Promise<DataQualityIssueEvidenceResult> {
    if (periodEnd < periodStart) {
      throw new ValidationError('periodEnd cannot be earlier than periodStart.');
    }
    const records = await this.sourceRepo.findByDataQualityIssue(periodStart, periodEnd, context, issue);
    const truncated = records.length > COMMAND_CENTRE_DRILL_DOWN_ROW_LIMIT;
    const rows: DataQualityIssueEvidenceRow[] = records.slice(0, COMMAND_CENTRE_DRILL_DOWN_ROW_LIMIT).map((r) => ({
      sourceRecordId: r._id!,
      sheetFamily: r.sheetFamily,
      importBatchId: r.importBatchId,
      sourceFileName: r.sourceFileName,
      sourceRowNumber: r.sourceRowNumber,
      date: r.date,
      rawDate: r.rawDate,
      registrationRaw: r.registrationRaw,
      transporterRaw: r.transporterRaw,
      customerName: r.customerName,
      destinationTown: r.destinationTown,
      costFacingCompany: r.costFacingCompany ?? undefined,
    }));
    return { issue, periodStart, periodEnd, rows, rowCount: records.length, truncated };
  }
}

export const transportCostReportService = new TransportCostReportService();
