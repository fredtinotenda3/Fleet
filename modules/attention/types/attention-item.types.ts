// modules/attention/types/attention-item.types.ts
//
// Persisted counterpart of modules/ai/types/needs-attention.types.ts's
// NeedsAttentionItem. The live feed (needsAttentionService.getFeed) is
// computed fresh on every call from five AI services plus compliance
// and maintenance; this collection is a durable snapshot of that feed
// so the queue survives past a single request/response and can later be
// resolved, audited, and exported (see the backlog items this ships
// ahead of -- resolve action, value ledger, ledger export).
//
// SCOPING
// Registered 'org-unit' in server/tenancy/module-scope.registry.ts.
// `orgUnitId` is set by needsAttentionService.persistFeed() at upsert
// time, resolved PER ITEM from that item's own true owning entity via
// AttentionOwnershipResolver (see attention-ownership.resolver.ts) --
// not tagged uniformly with the request's active org unit, which was
// the Phase 0 finding this fixes. A row whose owner cannot be safely
// determined (no single owning entity, entity not found, or entity not
// yet backfilled with its own orgUnitId) is persisted with orgUnitId
// left unset, which is fail-closed: invisible to any org-unit-scope-
// narrowed read, same convention as every other org-unit-scoped
// module in this codebase.
//
// IDENTITY
// `itemKey` carries the aggregator's own id (e.g. "fuel_fraud:alert-1",
// already unique across sources -- see makeItem() in
// needs-attention.service.ts) and is unique per tenant. Upserting on
// {tenantId, itemKey} is what makes repeated calls to getFeed()
// idempotent instead of inserting a fresh row every refresh.

import type { OrgUnitScopedEntity } from '@/server/repositories/tenant-scoped.repository';
import type { AISeverity } from '@/modules/ai/types/ai.types';
import type {
  NeedsAttentionSource,
  NeedsAttentionUrgency,
} from '@/modules/ai/types/needs-attention.types';
import type { AIEvidence } from '@/modules/ai/types/ai-evidence.types';

export interface AttentionItem extends OrgUnitScopedEntity {
  /**
   * Declared explicitly here (in addition to being inherited from
   * OrgUnitScopedEntity) so the module-scope conformance suite, which
   * greps this file for the literal field rather than resolving TS
   * inheritance, can see it. See module-scope.registry.ts's 'attention'
   * entry for how -- and how incompletely -- this is populated today.
   */
  orgUnitId?: string;
  /** The aggregator's own item id, e.g. "fuel_fraud:alert-1". Unique per tenant. */
  itemKey: string;
  source: NeedsAttentionSource;
  severity: AISeverity;
  urgency: NeedsAttentionUrgency;
  title: string;
  description: string;
  cost: number;
  priorityScore: number;
  dueDate?: Date | null;
  entityId?: string | null;
  entityLabel?: string | null;
  href?: string | null;
  /**
   * When this itemKey was first upserted. Set once, via $setOnInsert,
   * and never overwritten on subsequent refreshes.
   */
  firstSeenAt: Date;
  /**
   * When this itemKey was most recently produced by getFeed(). Updated
   * on every refresh. Not yet used to prune stale rows (an item whose
   * underlying condition has cleared just stops being refreshed) --
   * that sweep is a follow-up, not part of this pass.
   */
  lastSeenAt: Date;

  // ─── Resolution (Step 2) ──────────────────────────────────────────
  // Set by POST /api/ai/needs-attention/:id/resolve (see
  // attention-resolution.service.ts). getFeed()'s upsert deliberately
  // never touches these three fields on refresh -- an item that keeps
  // getting re-detected by its source after being marked resolved
  // stays resolved here rather than silently flipping back to 'open'.
  /** Defaults to 'open' on insert (see AttentionItemRepository.upsertFeedItems). */
  status?: 'open' | 'resolved';
  resolvedAt?: Date | null;
  resolvedBy?: string | null;

  /**
   * BACKLOG ITEM 7 -- the stored records the item's score rested on,
   * carried through from the AI service that produced it.
   *
   * Persisted, not merely computed, because this is the row an operator
   * ACTS on: BACKLOG ITEM 6 lets an item raise a work order, and "why
   * did the platform create this job?" is the first question asked
   * afterwards. An answer that only existed in the live feed at the
   * moment of dispatch is not an answer.
   *
   * Capped at MAX_EVIDENCE_REFS (20) upstream, so the field cannot grow
   * a row without bound.
   */
  evidence?: AIEvidence[];
}