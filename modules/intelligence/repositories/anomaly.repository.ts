// modules/intelligence/repositories/anomaly.repository.ts

import { Filter } from 'mongodb';
import { BaseRepository } from '@/server/repositories/base.repository';
import { Anomaly, AnomalyFilters, AnomalyStatus } from '@/shared/types/anomaly.types';
import { PaginationParams, PaginatedResponse } from '@/shared/types/common.types';

export class AnomalyRepository extends BaseRepository<Anomaly> {
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
}

export const anomalyRepository = new AnomalyRepository();