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
} from '../repositories/transport-cost-source-record.repository';
import { contractedVehicleRepository, ContractedVehicleRepository } from '../repositories/contracted-vehicle.repository';
import { transportPartnerRepository, TransportPartnerRepository } from '../repositories/transport-partner.repository';
import {
  transportCostImportExceptionRepository,
  TransportCostImportExceptionRepository,
} from '../repositories/transport-cost-import-exception.repository';
import { financeSettingsService, FinanceSettingsService } from '@/modules/finance/services/finance-settings.service';
import type { AllocationPosting, AllocationCostCategory } from '@/modules/finance/types/allocation.types';
import type { TenantContext } from '@/modules/tenancy/services/tenant-context.service';
import type { TransportCostSheetFamily } from '@/shared/types/transport-cost.types';
import type { TransportCostImportException } from '@/shared/types/transport-cost-import-exception.types';
import { NotFoundError, ValidationError } from '@/server/errors/app.errors';
import { roundCurrency } from '@/modules/finance/utils/fx-conversion.utils';
import { costFacingCompanyLabel } from '@/shared/types/cost-facing-company.types';

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

    const [totals, companyTotals, vehicles, settings, pendingCount] = await Promise.all([
      this.ledgerRepo.getNetTotalsByVehicleForCategory(COST_CATEGORY, periodStart, periodEnd, context),
      this.ledgerRepo.getNetTotalsByCompanyAcrossVehicles(COST_CATEGORY, periodStart, periodEnd, context),
      this.vehicleRepo.findAllConfirmed(context.organizationId),
      this.settingsService.resolve(context.organizationId),
      this.sourceRepo.countPendingAmount(periodStart, periodEnd, context),
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
    periodEnd: Date
  ): Promise<DataQualityExceptionsReport> {
    if (periodEnd < periodStart) {
      throw new ValidationError('periodEnd cannot be earlier than periodStart.');
    }

    // Step 1: which batches produced a posting actually inside this period?
    const inPeriodPostings = await this.ledgerRepo.findRawByCategoryInScope(
      COST_CATEGORY,
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
    const allBatchPostings = await this.ledgerRepo.findBySourceIdsForCategory(batchSourceIds, COST_CATEGORY, context);
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
}

export const transportCostReportService = new TransportCostReportService();
