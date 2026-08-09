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
  ],
} as const;
