// modules/transport-cost/repositories/normalization-review.repository.ts
//
// Phase O2 ("Phase O2 Spec" tab). Plain BaseRepository -- one shared
// queue for both kinds (transporter, vehicle); see
// normalization-review.types.ts's header for why. Organization-level,
// same reasoning as the other two O2 repositories in this directory.

import { Filter } from 'mongodb';
import { BaseRepository } from '@/server/repositories/base.repository';
import {
  NormalizationKind,
  NormalizationReviewItem,
} from '@/shared/types/normalization-review.types';
import { PaginationParams, PaginatedResponse } from '@/shared/types/common.types';

export class NormalizationReviewRepository extends BaseRepository<NormalizationReviewItem> {
  protected collectionName = 'tblnormalizationreviewitems';

  /**
   * A 'pending' item for this exact (kind, rawValue) pair, if one
   * already exists. The import path (O1's insertOrFlag, extended)
   * calls this BEFORE creating a new review item, so a repeatedly-seen
   * unresolved raw value accumulates onto ONE item's sourceRecordIds
   * rather than spawning a duplicate row per import batch.
   */
  async findPendingByRawValue(
    kind: NormalizationKind,
    rawValue: string,
    tenantId: string
  ): Promise<NormalizationReviewItem | null> {
    return this.findOne(
      { kind, rawValue, status: 'pending' } as Filter<NormalizationReviewItem>,
      tenantId
    );
  }

  async findPending(
    kind: NormalizationKind | undefined,
    tenantId: string,
    pagination: PaginationParams
  ): Promise<PaginatedResponse<NormalizationReviewItem>> {
    const filter: Filter<NormalizationReviewItem> = { status: 'pending' } as Filter<NormalizationReviewItem>;
    if (kind) (filter as any).kind = kind;
    return this.findWithPagination(filter, pagination, tenantId);
  }

  /**
   * Appends a source record id to a still-pending item's queue --
   * $addToSet so a re-import of the same file (O1's own duplicate
   * check usually catches this first, but this is a second, cheap
   * safety net) never double-lists the same record.
   */
  async appendSourceRecordId(
    id: string,
    sourceRecordId: string,
    tenantId: string
  ): Promise<void> {
    const collection = await this.getCollection();
    const filter: Record<string, unknown> = {
      ...this.getTenantFilter(tenantId),
      _id: this.toObjectId(id),
    };
    await collection.updateOne(
      filter as Filter<NormalizationReviewItem>,
      {
        $addToSet: { sourceRecordIds: sourceRecordId },
        $set: { updatedAt: new Date() },
      } as any
    );
  }

  async countPending(kind: NormalizationKind | undefined, tenantId: string): Promise<number> {
    const filter: Filter<NormalizationReviewItem> = { status: 'pending' } as Filter<NormalizationReviewItem>;
    if (kind) (filter as any).kind = kind;
    return this.count(filter, tenantId);
  }
}

export const normalizationReviewRepository = new NormalizationReviewRepository();
