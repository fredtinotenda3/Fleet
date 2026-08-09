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
// `orgUnitId` is set by needsAttentionService at upsert time -- see the
// rationale on that registry entry for exactly how (and its current
// limitation: it tags the ACTIVE org unit for the request rather than
// resolving each item's true owning entity, which is why the decision
// is still `confirmed: false`).
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
}
