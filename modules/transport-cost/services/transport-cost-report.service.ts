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
import type { AllocationPosting } from '@/modules/finance/types/allocation.types';
import type { TenantContext } from '@/modules/tenancy/services/tenant-context.service';
import type { TransportCostSheetFamily } from '@/shared/types/transport-cost.types';
import type { TransportCostImportException } from '@/shared/types/transport-cost-import-exception.types';
import { NotFoundError, ValidationError } from '@/server/errors/app.errors';
import { roundCurrency } from '@/modules/finance/utils/fx-conversion.utils';

// 'third-party-transport' only -- see allocation.types.ts's
// AllocationCostCategory for the Section R2 split. This report reads
// third-party postings exclusively; a Vansales ('transport-retainer')
// or Depot STO ('stock-transfer') report is a future phase's own
// query, not a filter added here, so this screen never silently
// blends a retainer or a stock movement into a "3rd Party delivery"
// total.
const COST_CATEGORY = 'third-party-transport' as const;
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

export interface TransportCostAllocationReport {
  periodStart: Date;
  periodEnd: Date;
  reportingCurrency: string;
  byBusinessStream: StreamGroupTotal[];
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

  // 'vansales' -- no per-row date column (see TransportCostSourceRecord.rawDate's
  // own header note); 'truck' holds the transporter name, not 'transporter'
  // (see the audit's Family 4 terminology-trap note), and the source's own
  // TOTAL column is the authoritative amount, not a re-summed weekly figure.
  return {
    rawDate: undefined,
    rawRegistration: asString(rawRow.registration),
    rawTransporter: asString(rawRow.truck),
    amount: asString(rawRow.total),
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

    const [totals, vehicles, settings, pendingCount] = await Promise.all([
      this.ledgerRepo.getNetTotalsByVehicleForCategory(COST_CATEGORY, periodStart, periodEnd, context),
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

    return {
      periodStart,
      periodEnd,
      reportingCurrency: currencies[0] ?? settings.reportingCurrency,
      byBusinessStream: Array.from(streamMap.values()),
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
