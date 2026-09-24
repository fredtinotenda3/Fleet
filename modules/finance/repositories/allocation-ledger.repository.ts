// modules/finance/repositories/allocation-ledger.repository.ts

import { Filter } from 'mongodb';
import { TenantScopedRepository } from '@/server/repositories/tenant-scoped.repository';
import { AllocationPosting, AllocationCostCategory } from '../types/allocation.types';
import { ConflictError } from '@/server/errors/app.errors';
import { TenantContext } from '@/modules/tenancy/services/tenant-context.service';
import { tenantScopeService } from '@/modules/tenancy/services/tenant-scope.service';

export interface AllocationLedgerFilters {
  vehicleId?: string;
  costCategory?: AllocationCostCategory;
  glAccountCode?: string;
  periodStart?: Date;
  periodEnd?: Date;
}

/**
 * THE PERIOD RULE, IN ONE PLACE: FULLY CONTAINED.
 *
 * ---------------------------------------------------------------
 * TWO SEMANTICS USED TO COEXIST
 * ---------------------------------------------------------------
 * `buildFilter` -- the LIST endpoint, i.e. the drill-down a finance
 * user opens to see which postings make up a figure -- constrained
 * `periodStart` alone: "starts within the window".
 *
 * `getNetTotalsByCategory` / `getNetTotalsByGlAccount` -- every path
 * that produces MONEY, including cost-per-km and GL reconciliation --
 * required both ends inside: "fully contained".
 *
 * They agree for every auto-posted transaction, because a dated fuel
 * log or expense posts with `periodStart === periodEnd`. They disagree
 * for a SPREAD posting -- depreciation, a shared cost -- whose range
 * starts inside the window and ends after it: the drill-down listed it,
 * the header did not count it. So the lines did not add up to the total
 * above them, on a screen whose entire purpose is that they should.
 *
 * Standardised on FULLY CONTAINED, for two reasons:
 *
 *   1. It is what the money already used. Changing the totals instead
 *      would retroactively restate figures a customer may have already
 *      reconciled against their own general ledger -- the one change
 *      that must never be made silently.
 *   2. The alternative, "overlaps the window", double-counts: a charge
 *      spanning January and February would appear in full in both
 *      months, and the year would not equal the sum of its months.
 *
 * The cost of this choice is real and is NOT hidden: a posting spanning
 * a window boundary appears in no report for that window.
 * `countSpanningPostings` exists so a caller can say how many, rather
 * than letting the exclusion be silent.
 */
export function buildPeriodFilter(
  periodStart?: Date,
  periodEnd?: Date
): Record<string, unknown> {
  const filter: Record<string, unknown> = {};
  if (periodStart) filter.periodStart = { $gte: periodStart };
  if (periodEnd) filter.periodEnd = { $lte: periodEnd };
  return filter;
}

/**
 * ADDED, Vansales posting slice. A single caller (TransportCostReportService)
 * now needs "postings for ANY of these cost categories" (third-party-transport
 * OR transport-retainer) rather than exactly one -- see that service's own
 * header for why the transport-cost report reads across both categories.
 * `costCategory` stays a plain equality match for every other existing
 * caller (a single category is still valid input, just the common case of
 * this now-slightly-wider type), so nothing about this is a breaking change
 * for gl-reconciliation.service.ts, allocation.controller.ts, or any other
 * caller of the four methods below that still passes one category.
 */
function costCategoryMatch(
  costCategory: AllocationCostCategory | AllocationCostCategory[]
): AllocationCostCategory | { $in: AllocationCostCategory[] } {
  return Array.isArray(costCategory) ? { $in: costCategory } : costCategory;
}

/**
 * ADDED, Command Centre Slice A. Combines a single-vehicle filter and a
 * vehicle-id-set filter (the transporter/destination/customer-derived
 * narrowing -- see getNetTotalsGrouped's own header) into ONE `vehicleId`
 * match clause.
 *
 * Deliberately NOT two independent `...(a?{}: {}), ...(b?{}:{})` spreads
 * onto the same match object: both conditions target the same
 * `vehicleId` key, so spreading both would let the second silently
 * clobber the first (whichever is spread last simply wins) rather than
 * apply both -- a real correctness bug if a caller ever needs to combine
 * a specific-vehicle filter with a transporter-derived id set (exactly
 * what TransportCostReportService.getCommandCentreSummary does whenever
 * a vehicle AND a transporter/destination/customer filter are active
 * together). This function makes the combination explicit and
 * INTERSECTING rather than last-write-wins: if `vehicleId` is not a
 * member of `vehicleIds`, the filters contradict each other and the
 * correct result is "matches nothing" (fail closed), never "silently
 * ignore one of the two filters the caller asked for".
 */
/** The `$group` output shape getNetTotalsGrouped's pipeline produces --
 *  named so its own `.map` avoids `any`, unlike the four pre-existing
 *  aggregations above it in this file (left untouched by this slice). */
interface GroupedRow {
  _id: { key?: string; reportingCurrency: string };
  netReportingAmount: number;
  postingCount: number;
}

function buildVehicleConstraint(vehicleId?: string, vehicleIds?: string[]): Record<string, unknown> {
  if (vehicleId && vehicleIds) {
    return vehicleIds.includes(vehicleId) ? { vehicleId } : { vehicleId: { $in: [] } };
  }
  if (vehicleId) return { vehicleId };
  if (vehicleIds) return { vehicleId: { $in: vehicleIds } };
  return {};
}

/**
 * APPEND-ONLY, same discipline and same reason as
 * modules/attention/repositories/value-ledger.repository.ts: a cost
 * posting that can be quietly edited or removed after the fact is not
 * evidence, and every figure the cost-per-km engine reports must be
 * reconstructable from the postings that produced it. update/
 * softDelete/hardDelete are overridden to throw so a future call site
 * that reaches for the inherited method fails loudly at the call
 * rather than silently in production.
 */
export class AllocationLedgerRepository extends TenantScopedRepository<AllocationPosting> {
  protected collectionName = 'tblallocationledger';

  /** The sole write path for a new (non-reversing) posting. */
  async append(
    data: Omit<
      AllocationPosting,
      '_id' | 'tenantId' | 'createdAt' | 'updatedAt' | 'isDeleted' | 'deletedAt' | 'createdBy' | 'updatedBy'
    >,
    tenantId: string,
    userId?: string
  ): Promise<AllocationPosting> {
    return this.create(data, tenantId, userId);
  }

  /** Every posting (original and reversal) attributed to one vehicle within the caller's scope, most recent first. */
  /**
   * PHASE 6 -- looks a posting up by its idempotency key.
   *
   * Used before auto-posting so a redelivered event finds the posting
   * its first delivery already wrote. Tenant-scoped like every other
   * read here; the key alone is not trusted as globally unique.
   */
  async findByIdempotencyKey(
    idempotencyKey: string,
    tenantId: string
  ): Promise<AllocationPosting | null> {
    const collection = await this.getCollection();
    return collection.findOne({
      tenantId,
      idempotencyKey,
      isDeleted: { $ne: true },
    } as never) as Promise<AllocationPosting | null>;
  }

  async findByVehicleInScope(
    vehicleId: string,
    context: TenantContext,
    filters: Omit<AllocationLedgerFilters, 'vehicleId'> = {}
  ): Promise<AllocationPosting[]> {
    const filter = this.buildFilter({ ...filters, vehicleId });
    return this.findManyInScope(filter, context, { sortBy: 'postedAt', sortOrder: 'desc' });
  }

  /**
   * Every posting (original AND reversal) for one source record's one
   * cost category, oldest first.
   *
   * ADDED, Phase O3. This is TransportCostPostingService's own
   * "have I already posted this, and is the last posting still current"
   * check -- see that service's header for the correction algorithm this
   * feeds. Deliberately reads the WHOLE history rather than trusting a
   * single idempotencyKey lookup: a correction's re-post cannot reuse the
   * original's idempotencyKey (the unique index would reject it -- the
   * original row is never deleted), so each version after the first gets
   * its own key, and "what is the current live version" has to be
   * derived from the append-only history itself -- the same
   * findReversalOf-by-query philosophy as the rest of this repository,
   * never a mutable pointer.
   */
  async findBySource(
    sourceCollection: AllocationPosting['sourceCollection'],
    sourceId: string,
    costCategory: AllocationCostCategory,
    context: TenantContext
  ): Promise<AllocationPosting[]> {
    return this.findManyInScope(
      { sourceCollection, sourceId, costCategory } as Filter<AllocationPosting>,
      context,
      { sortBy: 'postedAt', sortOrder: 'asc' }
    );
  }

  /**
   * Whether `postingId` has already been reversed -- discovered by
   * querying for a posting whose reversalOfPostingId points at it,
   * never by a mutable flag on the original (see the type's doc
   * comment). Scoped, so a caller cannot learn about a reversal on a
   * posting outside their org-unit visibility.
   */
  async findReversalOf(postingId: string, context: TenantContext): Promise<AllocationPosting | null> {
    const scopeFilter = tenantScopeService.buildFilter<AllocationPosting>(context, 'orgUnitId');
    const results = await this.findMany(
      { ...(scopeFilter as Filter<AllocationPosting>), reversalOfPostingId: postingId } as Filter<AllocationPosting>,
      context.organizationId,
      { limit: 1 }
    );
    return results[0] ?? null;
  }

  /**
   * Net (post-reversal) reporting-currency totals per cost category for
   * one vehicle over a period -- the aggregation the cost-per-km engine
   * and the GL reconciliation report both build on. Netting falls out
   * for free: a reversing posting carries the equal-and-opposite
   * reportingAmount of the original, so summing includes it exactly
   * like any other posting.
   */
  async getNetTotalsByCategory(
    vehicleId: string,
    periodStart: Date,
    periodEnd: Date,
    context: TenantContext
  ): Promise<Array<{ costCategory: AllocationCostCategory; reportingCurrency: string; netReportingAmount: number; postingCount: number }>> {
    const collection = await this.getCollection();
    const match: Record<string, unknown> = {
      ...this.getActiveFilter(context.organizationId),
      ...tenantScopeService.buildFilter<AllocationPosting>(context, 'orgUnitId'),
      vehicleId,
      ...buildPeriodFilter(periodStart, periodEnd),
    };

    const rows = await collection
      .aggregate([
        { $match: match },
        {
          $group: {
            _id: { costCategory: '$costCategory', reportingCurrency: '$reportingCurrency' },
            netReportingAmount: { $sum: '$reportingAmount' },
            postingCount: { $sum: 1 },
          },
        },
      ])
      .toArray();

    return rows.map((row: any) => ({
      costCategory: row._id.costCategory,
      reportingCurrency: row._id.reportingCurrency,
      netReportingAmount: row.netReportingAmount,
      postingCount: row.postingCount,
    }));
  }

  /**
   * Net (post-reversal) reporting-currency totals per GL account code
   * across every vehicle in the caller's scope over a period -- the
   * "platform total" side of GL reconciliation.
   */
  async getNetTotalsByGlAccount(
    periodStart: Date,
    periodEnd: Date,
    context: TenantContext
  ): Promise<Array<{ glAccountCode: string; netReportingAmount: number; postingCount: number }>> {
    const collection = await this.getCollection();
    const match: Record<string, unknown> = {
      ...this.getActiveFilter(context.organizationId),
      ...tenantScopeService.buildFilter<AllocationPosting>(context, 'orgUnitId'),
      glAccountCode: { $exists: true, $ne: null },
      ...buildPeriodFilter(periodStart, periodEnd),
    };

    const rows = await collection
      .aggregate([
        { $match: match },
        {
          $group: {
            _id: '$glAccountCode',
            netReportingAmount: { $sum: '$reportingAmount' },
            postingCount: { $sum: 1 },
          },
        },
      ])
      .toArray();

    return rows.map((row: any) => ({
      glAccountCode: row._id,
      netReportingAmount: row.netReportingAmount,
      postingCount: row.postingCount,
    }));
  }

  /**
   * ADDED, Phase O3. Net (post-reversal) reporting-currency totals PER
   * VEHICLE for one cost category over a period -- TransportCostReportService's
   * Stream -> Vehicle drill-down level. Same fully-contained period rule
   * and same currency-grouping-not-summing discipline as
   * getNetTotalsByGlAccount immediately below (this method's closest
   * relative: "one platform-wide aggregation, grouped, over a period"),
   * just grouped by vehicleId and additionally filtered to one
   * costCategory rather than requiring glAccountCode to exist -- a
   * transport-cost posting carries no glAccountCode (Olivine's GL
   * mapping is a separate, later confirmation).
   */
  async getNetTotalsByVehicleForCategory(
    costCategory: AllocationCostCategory | AllocationCostCategory[],
    periodStart: Date,
    periodEnd: Date,
    context: TenantContext
  ): Promise<Array<{ vehicleId: string; reportingCurrency: string; netReportingAmount: number; postingCount: number }>> {
    const collection = await this.getCollection();
    const match: Record<string, unknown> = {
      ...this.getActiveFilter(context.organizationId),
      ...tenantScopeService.buildFilter<AllocationPosting>(context, 'orgUnitId'),
      costCategory: costCategoryMatch(costCategory),
      ...buildPeriodFilter(periodStart, periodEnd),
    };

    const rows = await collection
      .aggregate([
        { $match: match },
        {
          $group: {
            _id: { vehicleId: '$vehicleId', reportingCurrency: '$reportingCurrency' },
            netReportingAmount: { $sum: '$reportingAmount' },
            postingCount: { $sum: 1 },
          },
        },
      ])
      .toArray();

    return rows.map((row: any) => ({
      vehicleId: row._id.vehicleId,
      reportingCurrency: row._id.reportingCurrency,
      netReportingAmount: row.netReportingAmount,
      postingCount: row.postingCount,
    }));
  }

  /**
   * ADDED, OLIVINE LIVE OPERATING MODEL (item 2/3/4/10/11 -- see
   * shared/types/cost-facing-company.types.ts). Net (post-reversal)
   * reporting-currency totals PER COST-FACING COMPANY (Hypery / Olivine
   * / Surface) across every vehicle in the caller's scope over a period
   * -- the dashboard/report screen's primary breakdown. Same shape and
   * same fully-contained period rule as getNetTotalsByVehicleForCategory
   * immediately above (this method's closest relative), just grouped by
   * `costFacingCompany` instead of `vehicleId`.
   *
   * Deliberately a flat `$group` on the field itself, NOT `$ifNull`/any
   * computed expression to fold a missing value into an "unattributed"
   * bucket server-side -- tests/helpers/fake-collection.ts's aggregate()
   * only implements a flat field-path `_id` (see
   * OLIVINE_COST_INTELLIGENCE_COMMAND_CENTRE_DESIGN.md Section 6.2 for
   * the exact same constraint already documented for this repository).
   * A posting with no costFacingCompany groups under `_id.costFacingCompany:
   * null`; the caller maps that to the same 'unattributed' label the
   * rest of this codebase already uses for a missing dimension (see
   * TransportCostReportService's UNATTRIBUTED constant), in application
   * code, not in the pipeline.
   */
  async getNetTotalsByCompanyAcrossVehicles(
    costCategory: AllocationCostCategory | AllocationCostCategory[],
    periodStart: Date,
    periodEnd: Date,
    context: TenantContext
  ): Promise<Array<{ costFacingCompany: string | null; reportingCurrency: string; netReportingAmount: number; postingCount: number }>> {
    const collection = await this.getCollection();
    const match: Record<string, unknown> = {
      ...this.getActiveFilter(context.organizationId),
      ...tenantScopeService.buildFilter<AllocationPosting>(context, 'orgUnitId'),
      costCategory: costCategoryMatch(costCategory),
      ...buildPeriodFilter(periodStart, periodEnd),
    };

    const rows = await collection
      .aggregate([
        { $match: match },
        {
          $group: {
            _id: { costFacingCompany: '$costFacingCompany', reportingCurrency: '$reportingCurrency' },
            netReportingAmount: { $sum: '$reportingAmount' },
            postingCount: { $sum: 1 },
          },
        },
      ])
      .toArray();

    return rows.map((row: any) => ({
      costFacingCompany: row._id.costFacingCompany ?? null,
      reportingCurrency: row._id.reportingCurrency,
      netReportingAmount: row.netReportingAmount,
      postingCount: row.postingCount,
    }));
  }

  /**
   * ADDED, Phase O3. Distinct calendar months (1st-of-month, UTC) that
   * have at least one posting for a cost category -- the O4 screen's
   * "switch to any imported month" control. Derived from the LEDGER
   * (postings), not from raw source records: this report only ever
   * reads what O3 actually posted, per the hard "sourced from postings,
   * never raw source records" requirement, so the month picker cannot
   * offer a month that has no postings to show.
   *
   * Deliberately NOT a `$group`-by-year/month aggregation: the number of
   * distinct months for one tenant's transport-cost data is small (this
   * is a calendar dimension, not a row count), so reducing in
   * application code over a plain scoped find is both simpler and
   * exercisable against tests/helpers/fake-collection.ts's minimal
   * aggregate (which does not implement Mongo's $year/$month date
   * operators) rather than requiring a live Mongo instance to test at
   * all.
   */
  async getDistinctPostedMonths(
    costCategory: AllocationCostCategory | AllocationCostCategory[],
    context: TenantContext
  ): Promise<Date[]> {
    const postings = await this.findManyInScope(
      { costCategory: costCategoryMatch(costCategory) } as Filter<AllocationPosting>,
      context,
      { limit: 100000 }
    );

    const months = new Set<string>();
    for (const posting of postings) {
      const d = new Date(posting.periodStart);
      months.add(`${d.getUTCFullYear()}-${d.getUTCMonth()}`);
    }

    return Array.from(months)
      .map((key) => {
        const [year, month] = key.split('-').map(Number);
        return new Date(Date.UTC(year, month, 1));
      })
      .sort((a, b) => a.getTime() - b.getTime());
  }

  /**
   * ADDED, item 6 (data-quality exceptions export). Raw (non-aggregated)
   * postings for one cost category, across every vehicle in the
   * caller's scope, whose periodStart/periodEnd both fall within
   * [periodStart, periodEnd] -- same fully-contained rule and same
   * scope as getNetTotalsByVehicleForCategory immediately above, but
   * returns the individual postings rather than a grouped sum.
   *
   * Needed because TransportCostReportService.getDataQualityExceptions
   * has to resolve each posting's sourceId back to the
   * TransportCostSourceRecord it came from (to find that record's
   * importBatchId) -- a total has nothing to resolve.
   */
  async findRawByCategoryInScope(
    costCategory: AllocationCostCategory | AllocationCostCategory[],
    periodStart: Date,
    periodEnd: Date,
    context: TenantContext,
    /**
     * WIDENED, Command Centre Slice A. The by-destination/by-customer/
     * time-series paths (see TransportCostReportService
     * .getCommandCentreSummary) need the SAME raw-posting fetch this
     * method already provides for getDataQualityExceptions, just also
     * narrowed by an active company/vehicle/transporter filter BEFORE
     * the bounded fetch runs -- pushing these down to Mongo rather than
     * filtering 100000 rows in Node for a filter Mongo can apply
     * directly (destinationTown/customerName cannot be pushed down the
     * same way, since they live on the joined source record, not the
     * posting -- those stay a Node-side filter in the service, after
     * this fetch). Optional and defaulted so getDataQualityExceptions's
     * existing call site is unaffected.
     */
    extraMatch: { costFacingCompany?: string; vehicleId?: string; vehicleIds?: string[] } = {}
  ): Promise<AllocationPosting[]> {
    if (extraMatch.vehicleIds && extraMatch.vehicleIds.length === 0) {
      return [];
    }
    return this.findManyInScope(
      {
        costCategory: costCategoryMatch(costCategory),
        ...buildPeriodFilter(periodStart, periodEnd),
        ...(extraMatch.costFacingCompany ? { costFacingCompany: extraMatch.costFacingCompany } : {}),
        ...buildVehicleConstraint(extraMatch.vehicleId, extraMatch.vehicleIds),
      } as Filter<AllocationPosting>,
      context,
      { limit: 100000 }
    );
  }

  /**
   * ADDED, item 6. Every posting (any period, any vehicle, in the
   * caller's scope) for one cost category whose sourceId is in the
   * given set -- deliberately IGNORES periodStart/periodEnd, unlike
   * every other read in this file.
   *
   * This is what makes the "period outlier" side of the data-quality
   * exceptions report possible: TransportCostReportService first finds
   * which import batches touched the requested period (via
   * findRawByCategoryInScope above), then resolves every source record
   * in those SAME batches, then calls this method with those records'
   * ids to see every posting those batches actually produced --
   * including the ones whose own periodStart falls outside the
   * requested window (e.g. the January-2026 import's four rows with a
   * "25" vs "26" year typo, which post correctly to January 2025 and
   * would otherwise be invisible to any period-scoped query). A caller
   * that wants only the in-period subset already has
   * findRawByCategoryInScope; this method exists specifically for the
   * complement.
   */
  async findBySourceIdsForCategory(
    sourceIds: string[],
    costCategory: AllocationCostCategory | AllocationCostCategory[],
    context: TenantContext
  ): Promise<AllocationPosting[]> {
    if (sourceIds.length === 0) return [];
    return this.findManyInScope(
      { costCategory: costCategoryMatch(costCategory), sourceId: { $in: sourceIds } } as Filter<AllocationPosting>,
      context,
      { limit: 100000 }
    );
  }

  /**
   * ADDED, Command Centre Slice A. One flexible aggregation replacing a
   * would-be family of near-duplicate methods
   * (getNetTotalsByCategoryAcrossVehicles, getNetTotalsByCompanyFiltered,
   * ...): the Command Centre summary needs the SAME "net reporting-
   * currency total, grouped one way, filtered several other ways" shape
   * for every KPI card and every dimension chart (period total, by
   * company, by category, by vehicle -- see
   * OLIVINE_COST_INTELLIGENCE_COMMAND_CENTRE_DESIGN.md Section 9's
   * proposed `getNetTotalsByCategoryAcrossVehicles`, generalized here to
   * also cover the period-total and by-vehicle cases with the SAME
   * method rather than three). `dimension: 'none'` groups by
   * reportingCurrency alone -- the period-total KPI card's own shape
   * (still split by currency, per this repository's existing "never sum
   * two currencies" discipline).
   *
   * DELIBERATELY ADDITIVE, NOT A REFACTOR of getNetTotalsByVehicleForCategory
   * / getNetTotalsByCompanyAcrossVehicles above: those back the existing,
   * already-shipped O4 report screen and Slice-1 company dashboard; this
   * codebase's own established rule (see COST_CATEGORY's header in
   * transport-cost-report.service.ts) is that a widened read path is
   * added ALONGSIDE an existing narrow one, never rewritten in place, so
   * a screen a customer may already be reconciling against never changes
   * its numbers underneath it silently.
   *
   * `filters.vehicleIds` is how a transporter filter reaches this
   * method: AllocationPosting carries no transporterPartnerId (see this
   * repository's own header / the design doc's Section 16 destination
   * decision, which applies identically here) -- the service layer
   * resolves "this transporter's vehicles" via
   * ContractedVehicleRepository.findByTransporterPartnerId first, then
   * passes the resulting id list down as a $in, the same
   * resolve-then-push-down pattern the destination/customer path uses
   * for the fields that live on the source record instead of the
   * posting.
   */
  async getNetTotalsGrouped(
    dimension: 'none' | 'costFacingCompany' | 'costCategory' | 'vehicleId',
    costCategoryScope: AllocationCostCategory[],
    periodStart: Date,
    periodEnd: Date,
    context: TenantContext,
    filters: {
      costFacingCompany?: string;
      costCategory?: AllocationCostCategory;
      vehicleId?: string;
      vehicleIds?: string[];
    } = {}
  ): Promise<Array<{ key: string | null; reportingCurrency: string; netReportingAmount: number; postingCount: number }>> {
    // A transporter filter that resolved to zero vehicles must return
    // "no data", never "ignore the filter" -- an empty $in matches
    // nothing in real Mongo, which is exactly the fail-closed behaviour
    // wanted here, but tests/helpers/fake-collection.ts's matcher is
    // asserted against directly too (see the repository spec), so this
    // is exercised, not just assumed.
    if (filters.vehicleIds && filters.vehicleIds.length === 0) {
      return [];
    }

    const collection = await this.getCollection();
    const match: Record<string, unknown> = {
      ...this.getActiveFilter(context.organizationId),
      ...tenantScopeService.buildFilter<AllocationPosting>(context, 'orgUnitId'),
      costCategory: costCategoryMatch(filters.costCategory ?? costCategoryScope),
      ...buildPeriodFilter(periodStart, periodEnd),
      ...(filters.costFacingCompany ? { costFacingCompany: filters.costFacingCompany } : {}),
      ...buildVehicleConstraint(filters.vehicleId, filters.vehicleIds),
    };

    const groupId: Record<string, string> = { reportingCurrency: '$reportingCurrency' };
    if (dimension !== 'none') {
      groupId.key = `$${dimension}`;
    }

    const rows = await collection
      .aggregate([
        { $match: match },
        {
          $group: {
            _id: groupId,
            netReportingAmount: { $sum: '$reportingAmount' },
            postingCount: { $sum: 1 },
          },
        },
      ])
      .toArray();

    return (rows as GroupedRow[]).map((row) => ({
      key: dimension === 'none' ? null : row._id.key ?? null,
      reportingCurrency: row._id.reportingCurrency,
      netReportingAmount: row.netReportingAmount,
      postingCount: row.postingCount,
    }));
  }

  private buildFilter(filters: AllocationLedgerFilters): Filter<AllocationPosting> {
    const filter: Record<string, unknown> = {};
    if (filters.vehicleId) filter.vehicleId = filters.vehicleId;
    if (filters.costCategory) filter.costCategory = filters.costCategory;
    if (filters.glAccountCode) filter.glAccountCode = filters.glAccountCode;
    Object.assign(filter, buildPeriodFilter(filters.periodStart, filters.periodEnd));
    return filter as Filter<AllocationPosting>;
  }

  /**
   * How many postings OVERLAP a window without being contained by it.
   *
   * These are the postings the window deliberately excludes -- a
   * depreciation charge or a shared-cost allocation spread across a
   * range that starts before the window or ends after it. Counting them
   * is what stops the exclusion being silent: a report that quietly
   * drops a cost is the exact failure the fully-contained rule is
   * chosen to avoid on the other side.
   *
   * Zero for every auto-posted transaction, which is the common case:
   * a dated fuel log posts with periodStart === periodEnd.
   */
  async countSpanningPostings(
    context: TenantContext,
    periodStart: Date,
    periodEnd: Date,
    extra: Omit<AllocationLedgerFilters, 'periodStart' | 'periodEnd'> = {}
  ): Promise<number> {
    const collection = await this.getCollection();
    const base: Record<string, unknown> = {
      tenantId: context.organizationId,
      isDeleted: { $ne: true },
      ...(tenantScopeService.buildFilter<AllocationPosting>(context, 'orgUnitId') as Record<string, unknown>),
      ...(extra.vehicleId ? { vehicleId: extra.vehicleId } : {}),
      ...(extra.costCategory ? { costCategory: extra.costCategory } : {}),
      ...(extra.glAccountCode ? { glAccountCode: extra.glAccountCode } : {}),
      // Overlaps the window ...
      periodStart: { $lte: periodEnd },
      periodEnd: { $gte: periodStart },
      // ... but is not contained by it.
      $or: [{ periodStart: { $lt: periodStart } }, { periodEnd: { $gt: periodEnd } }],
    };
    return collection.countDocuments(base as never);
  }

  async update(): Promise<AllocationPosting | null> {
    throw new ConflictError(
      'tblallocationledger is append-only: postings cannot be updated once written. Post a reversing entry instead.'
    );
  }

  async softDelete(): Promise<boolean> {
    throw new ConflictError('tblallocationledger is append-only: postings cannot be deleted.');
  }

  async hardDelete(): Promise<boolean> {
    throw new ConflictError('tblallocationledger is append-only: postings cannot be deleted.');
  }
}

export const allocationLedgerRepository = new AllocationLedgerRepository();