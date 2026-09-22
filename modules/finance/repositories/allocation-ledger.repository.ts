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
    costCategory: AllocationCostCategory,
    periodStart: Date,
    periodEnd: Date,
    context: TenantContext
  ): Promise<Array<{ vehicleId: string; reportingCurrency: string; netReportingAmount: number; postingCount: number }>> {
    const collection = await this.getCollection();
    const match: Record<string, unknown> = {
      ...this.getActiveFilter(context.organizationId),
      ...tenantScopeService.buildFilter<AllocationPosting>(context, 'orgUnitId'),
      costCategory,
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
  async getDistinctPostedMonths(costCategory: AllocationCostCategory, context: TenantContext): Promise<Date[]> {
    const postings = await this.findManyInScope({ costCategory } as Filter<AllocationPosting>, context, {
      limit: 100000,
    });

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