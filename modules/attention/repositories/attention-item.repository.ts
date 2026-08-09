// modules/attention/repositories/attention-item.repository.ts

import { AnyBulkWriteOperation } from 'mongodb';
import { TenantScopedRepository } from '@/server/repositories/tenant-scoped.repository';
import { AttentionItem } from '../types/attention-item.types';
import type { NeedsAttentionItem } from '@/modules/ai/types/needs-attention.types';

export interface UpsertFeedResult {
  upsertedCount: number;
  modifiedCount: number;
  matchedCount: number;
}

/**
 * SCOPED (org-unit). See server/tenancy/module-scope.registry.ts for the
 * 'attention' entry and its rationale.
 */
export class AttentionItemRepository extends TenantScopedRepository<AttentionItem> {
  protected collectionName = 'tblattentionitems';

  /**
   * Idempotently persists a batch of live feed items for one tenant.
   *
   * Keyed on {tenantId, itemKey}: calling this twice with the same
   * items (as needsAttentionService.getFeed() does on every refresh)
   * updates the same rows in place rather than inserting duplicates.
   * `firstSeenAt` is written only via $setOnInsert so it survives every
   * subsequent refresh untouched; `lastSeenAt` and the mutable fields
   * (severity, urgency, priorityScore, ...) are written via $set every
   * time so a row reflects the most recent computation of that item.
   *
   * Uses an unordered bulkWrite so one bad document doesn't abort the
   * rest of the batch -- consistent with the aggregator's own
   * failure-isolation stance (needs-attention.service.ts) that one
   * source's problem should not blank out everything else.
   */
  async upsertFeedItems(
    tenantId: string,
    items: NeedsAttentionItem[],
    orgUnitId?: string
  ): Promise<UpsertFeedResult> {
    if (items.length === 0) {
      return { upsertedCount: 0, modifiedCount: 0, matchedCount: 0 };
    }

    const collection = await this.getCollection();
    const now = new Date();

    const ops: AnyBulkWriteOperation<AttentionItem>[] = items.map((item) => ({
      updateOne: {
        filter: { tenantId, itemKey: item.id } as any,
        update: {
          $set: {
            tenantId,
            itemKey: item.id,
            source: item.source,
            severity: item.severity,
            urgency: item.urgency,
            title: item.title,
            description: item.description,
            cost: item.cost,
            priorityScore: item.priorityScore,
            dueDate: item.dueDate ?? null,
            entityId: item.entityId ?? null,
            entityLabel: item.entityLabel ?? null,
            href: item.href ?? null,
            orgUnitId: orgUnitId ?? null,
            lastSeenAt: now,
            updatedAt: now,
            isDeleted: false,
          },
          $setOnInsert: {
            firstSeenAt: now,
            createdAt: now,
          },
        } as any,
        upsert: true,
      },
    }));

    const result = await collection.bulkWrite(ops, { ordered: false });

    return {
      upsertedCount: result.upsertedCount,
      modifiedCount: result.modifiedCount,
      matchedCount: result.matchedCount,
    };
  }
}

export const attentionItemRepository = new AttentionItemRepository();
