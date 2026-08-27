// infrastructure/database/indexes.attention-addendum.ts

export const ATTENTION_INDEXES = {
  tblattentionitems: [
    {
      // Enforces the idempotent-upsert guarantee at the DB level, not
      // just in application code: one row per (tenant, itemKey), no
      // matter how many times getFeed() refreshes it. Also the exact
      // shape AttentionItemRepository.upsertFeedItems() filters on, so
      // this is the index its bulkWrite upserts hit.
      key: { tenantId: 1, itemKey: 1 },
      name: 'idx_attentionitem_tenant_itemkey',
      unique: true,
    },
    {
      key: { tenantId: 1, orgUnitId: 1, priorityScore: -1 },
      name: 'idx_attentionitem_tenant_orgunit_priority',
    },
    {
      key: { tenantId: 1, source: 1, severity: 1 },
      name: 'idx_attentionitem_tenant_source_severity',
    },
    {
      key: { tenantId: 1, lastSeenAt: -1 },
      name: 'idx_attentionitem_tenant_lastseen',
    },
    {
      key: { tenantId: 1, status: 1 },
      name: 'idx_attentionitem_tenant_status',
    },
  ],
  tblvalueledger: [
    {
      // One posting per attention item per tenant -- mirrors the
      // controller-side "already resolved" check as a DB-level
      // guarantee, so a race between two concurrent resolve calls for
      // the same item can't produce two postings.
      key: { tenantId: 1, attentionItemKey: 1 },
      name: 'idx_valueledger_tenant_itemkey',
      unique: true,
    },
    {
      key: { tenantId: 1, resolvedAt: -1 },
      name: 'idx_valueledger_tenant_resolved',
    },
    {
      key: { tenantId: 1, source: 1, baselineTier: 1 },
      name: 'idx_valueledger_tenant_source_tier',
    },
  ],
  // PHASE 6 -- attention-to-action dispatch records.
  tblattention_dispatches: [
    {
      // THE DISPATCH IDEMPOTENCY CONSTRAINT.
      //
      // Attention items are re-upserted on every refresh cycle, and
      // dispatch can be driven by events under Phase 3's at-least-once
      // delivery. Without this, one flagged vehicle accumulates a new
      // work order every cycle -- a queue of duplicate jobs that looks
      // like a far bigger problem than the one actually detected.
      key: { tenantId: 1, idempotencyKey: 1 },
      name: 'uniq_attention_dispatch_tenant_idempotency',
      unique: true,
    },
    {
      // "What has this item already caused?" -- the read an operator
      // makes when an attention item looks stuck, and the one the
      // resolution path uses to link a completed action back to its
      // item.
      key: { tenantId: 1, attentionItemKey: 1, dispatchedAt: -1 },
      name: 'idx_attention_dispatch_tenant_item',
    },
    {
      // Org-unit scoped listing, matching every other scoped read.
      key: { tenantId: 1, orgUnitId: 1, dispatchedAt: -1 },
      name: 'idx_attention_dispatch_tenant_unit',
    },
  ],
} as const;