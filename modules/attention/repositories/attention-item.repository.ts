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
   *
   * PHASE 0 FIX: takes a per-item `orgUnitId` (paired with its item by
   * the caller) rather than a single value applied to every row in the
   * batch. See needsAttentionService.persistFeed() for how each item's
   * orgUnitId is resolved from its own TRUE owning entity via
   * AttentionOwnershipResolver, and the 'attention' entry in
   * server/tenancy/module-scope.registry.ts for the history of why
   * this changed. `null`/`undefined` (unresolvable owner) is persisted
   * as `null` -- fail-closed, invisible to org-unit-scope-narrowed
   * reads -- exactly as an unset orgUnitId already behaved before this
   * fix.
   */
  async upsertFeedItems(
    tenantId: string,
    itemsWithOwnership: Array<{ item: NeedsAttentionItem; orgUnitId: string | null | undefined }>
  ): Promise<UpsertFeedResult> {
    if (itemsWithOwnership.length === 0) {
      return { upsertedCount: 0, modifiedCount: 0, matchedCount: 0 };
    }

    const collection = await this.getCollection();
    const now = new Date();

    const ops: AnyBulkWriteOperation<AttentionItem>[] = itemsWithOwnership.map(({ item, orgUnitId }) => ({
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
            status: 'open',
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

  /**
   * Looks up one persisted item by its stable itemKey (e.g.
   * "fuel_fraud:alert-1") rather than by the Mongo _id -- itemKey is
   * the identifier the live feed (and therefore any caller acting on
   * an item from that feed, e.g. the resolve endpoint) actually knows.
   */
  async findByItemKey(tenantId: string, itemKey: string): Promise<AttentionItem | null> {
    const collection = await this.getCollection();
    const doc = await collection.findOne({
      tenantId,
      itemKey,
      isDeleted: { $ne: true },
    } as any);
    return this.normalizeDoc<AttentionItem | null>(doc ?? null);
  }

  /**
   * Marks a persisted item resolved. Deliberately narrow: sets only
   * status/resolvedAt/resolvedBy/updatedAt, so it can never be used to
   * rewrite the substantive fields (severity, cost, ...) that
   * upsertFeedItems() owns. Returns null if no row with this itemKey
   * exists yet -- the caller (attention-resolution.service.ts) treats
   * that as "refresh the feed first", not a silent no-op.
   */
  async resolveByItemKey(
    tenantId: string,
    itemKey: string,
    resolvedBy: string
  ): Promise<AttentionItem | null> {
    const collection = await this.getCollection();
    const now = new Date();
    const result = await collection.findOneAndUpdate(
      { tenantId, itemKey, isDeleted: { $ne: true } } as any,
      {
        $set: {
          status: 'resolved',
          resolvedAt: now,
          resolvedBy,
          updatedAt: now,
        },
      } as any,
      { returnDocument: 'after' }
    );
    return this.normalizeDoc<AttentionItem | null>(result ?? null);
  }
}

export const attentionItemRepository = new AttentionItemRepository();