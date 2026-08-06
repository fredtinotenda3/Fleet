// modules/intelligence/repositories/anomaly.repository.ts

import { Filter } from 'mongodb';
import { TenantScopedRepository } from '@/server/repositories/tenant-scoped.repository';
import { TenantContext } from '@/modules/tenancy/services/tenant-context.service';
import { Anomaly, AnomalyFilters, AnomalyStatus } from '@/shared/types/anomaly.types';
import '@/shared/types/anomaly.tenancy-addendum';
import { PaginationParams, PaginatedResponse } from '@/shared/types/common.types';
import { tenantScopeService } from '@/modules/tenancy/services/tenant-scope.service';

/**
 * SCOPED (Phase F). A derived record cannot be less protected than its
 * inputs, or analytics becomes a bypass for the scoping applied to the
 * source collections: the fuel logs are hidden, but "unusual fuel spend
 * on AHA2127" is not.
 */
export class AnomalyRepository extends TenantScopedRepository<Anomaly> {
  protected collectionName = 'tblanomalies';

  async getFiltered(
    filters: AnomalyFilters,
    tenantId: string,
    pagination: PaginationParams
  ): Promise<PaginatedResponse<Anomaly>> {
    const filter: Record<string, unknown> = {};

    if (filters.category) filter.category = filters.category;
    if (filters.severity) filter.severity = filters.severity;
    if (filters.status) filter.status = filters.status;
    if (filters.licensePlate) filter.licensePlate = filters.licensePlate;

    // Attach default sorting to the pagination object instead of passing it as the 4th argument
    const paginationParams: PaginationParams & { sort?: Record<string, 1 | -1> } = {
      ...pagination,
      sort: (pagination as any).sort || { detectedAt: -1 },
    };

    return this.findWithPagination(filter as Filter<Anomaly>, paginationParams, tenantId);
  }

  /** Org-unit-scoped variant of getFiltered. */
  async getFilteredInScope(
    filters: AnomalyFilters,
    context: TenantContext,
    pagination: PaginationParams
  ): Promise<PaginatedResponse<Anomaly>> {
    const filter: Record<string, unknown> = {};

    if (filters.category) filter.category = filters.category;
    if (filters.severity) filter.severity = filters.severity;
    if (filters.status) filter.status = filters.status;
    if (filters.licensePlate) filter.licensePlate = filters.licensePlate;

    const paginationParams: PaginationParams & { sort?: Record<string, 1 | -1> } = {
      ...pagination,
      sort: (pagination as any).sort || { detectedAt: -1 },
    };

    return this.findWithPaginationInScope(
      filter as Filter<Anomaly>,
      paginationParams,
      context
    );
  }

  /**
   * Returns the currently-open anomaly matching this fingerprint, if
   * one exists. Used by AnomalyDetectionService to avoid writing a new
   * duplicate row every time the same underlying condition is detected
   * again (e.g. the same vehicle's fuel efficiency stays low across
   * several fuel-ups in the same day).
   */
  async findOpenByFingerprint(fingerprint: string, tenantId: string): Promise<Anomaly | null> {
    const collection = await this.getCollection();
    return collection.findOne({
      tenantId,
      fingerprint,
      status: 'open',
      isDeleted: { $ne: true },
    } as Filter<Anomaly>);
  }

  async updateStatus(
    id: string,
    tenantId: string,
    status: AnomalyStatus,
    userId: string
  ): Promise<Anomaly | null> {
    const timestampField =
      status === 'acknowledged' ? 'acknowledgedAt' : status === 'resolved' ? 'resolvedAt' : undefined;
    const userField =
      status === 'acknowledged' ? 'acknowledgedBy' : status === 'resolved' ? 'resolvedBy' : undefined;

    const updates: Partial<Anomaly> = { status };
    if (timestampField) (updates as any)[timestampField] = new Date();
    if (userField) (updates as any)[userField] = userId;

    return this.update(id, updates, tenantId, userId);
  }

  async countOpenBySeverity(tenantId: string): Promise<Record<string, number>> {
    const collection = await this.getCollection();
    const results = await collection
      .aggregate([
        { $match: { tenantId, status: 'open', isDeleted: { $ne: true } } },
        { $group: { _id: '$severity', count: { $sum: 1 } } },
      ])
      .toArray();

    const counts: Record<string, number> = { low: 0, medium: 0, high: 0, critical: 0 };
    for (const r of results) counts[r._id as string] = r.count;
    return counts;
  }

  /**
   * Org-unit-scoped variant of countOpenBySeverity.
   *
   * The scope predicate is merged into the $match stage, so it applies
   * before the $group rather than being subtracted afterwards. An
   * unscoped aggregate leaks COUNTS instead of rows -- quieter than a
   * list leak and easier to ship, but it still tells a branch manager
   * how many critical anomalies exist across the whole organization.
   */
  async countOpenBySeverityInScope(context: TenantContext): Promise<Record<string, number>> {
    const collection = await this.getCollection();
    const scopeFilter = tenantScopeService.buildFilter<Anomaly>(context, 'orgUnitId');
    const results = await collection
      .aggregate([
        {
          $match: {
            tenantId: context.organizationId,
            status: 'open',
            isDeleted: { $ne: true },
            ...scopeFilter,
          },
        },
        { $group: { _id: '$severity', count: { $sum: 1 } } },
      ])
      .toArray();

    const counts: Record<string, number> = { low: 0, medium: 0, high: 0, critical: 0 };
    for (const r of results) counts[r._id as string] = r.count;
    return counts;
  }
}

export const anomalyRepository = new AnomalyRepository();