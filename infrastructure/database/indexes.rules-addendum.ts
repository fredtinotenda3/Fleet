// infrastructure/database/indexes.rules-addendum.ts
//
// Merge into the INDEXES map in infrastructure/database/indexes.ts.

export const RULES_INDEXES = {
  tblrules: [
    {
      key: { tenantId: 1, trigger: 1, status: 1, priority: 1 },
      name: 'idx_rule_tenant_trigger_status_priority',
    },
    {
      key: { tenantId: 1, category: 1 },
      name: 'idx_rule_tenant_category',
    },
    {
      key: { tenantId: 1, tags: 1 },
      name: 'idx_rule_tenant_tags',
    },
    {
      key: { isDeleted: 1, tenantId: 1 },
      name: 'idx_rule_deleted_tenant',
    },
  ],
} as const;

/**
 * The `{ tenantId, trigger, status, priority }` compound index is the one
 * that matters for production load: RuleEngineService.fireTrigger() runs
 * this exact shape of query (equality on tenantId/trigger/status, sorted
 * by priority) on every single domain event that has any rules registered
 * against it, so at fleet scale this needs to be a covered/near-covered
 * index scan rather than a collection scan.
 */