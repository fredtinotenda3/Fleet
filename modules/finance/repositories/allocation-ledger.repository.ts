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
      periodStart: { $gte: periodStart },
      periodEnd: { $lte: periodEnd },
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
      periodStart: { $gte: periodStart },
      periodEnd: { $lte: periodEnd },
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

  private buildFilter(filters: AllocationLedgerFilters): Filter<AllocationPosting> {
    const filter: Record<string, unknown> = {};
    if (filters.vehicleId) filter.vehicleId = filters.vehicleId;
    if (filters.costCategory) filter.costCategory = filters.costCategory;
    if (filters.glAccountCode) filter.glAccountCode = filters.glAccountCode;
    if (filters.periodStart || filters.periodEnd) {
      const periodFilter: Record<string, Date> = {};
      if (filters.periodStart) periodFilter.$gte = filters.periodStart;
      if (filters.periodEnd) periodFilter.$lte = filters.periodEnd;
      filter.periodStart = periodFilter;
    }
    return filter as Filter<AllocationPosting>;
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