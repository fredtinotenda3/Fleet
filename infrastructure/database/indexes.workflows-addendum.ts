// infrastructure/database/indexes.workflows-addendum.ts
//
// Merge into the INDEXES map in infrastructure/database/indexes.ts.

export const WORKFLOWS_INDEXES = {
  tblworkflows: [
    {
      key: { tenantId: 1, status: 1 },
      name: 'idx_workflow_tenant_status',
    },
    {
      key: { tenantId: 1, type: 1 },
      name: 'idx_workflow_tenant_type',
    },
    {
      key: { tenantId: 1, 'triggers.event': 1, status: 1 },
      name: 'idx_workflow_tenant_trigger_status',
    },
  ],
  tblworkflow_instances: [
    {
      key: { tenantId: 1, status: 1, createdAt: 1 },
      name: 'idx_winstance_tenant_status_created',
    },
    {
      key: { tenantId: 1, entityId: 1, entityType: 1 },
      name: 'idx_winstance_tenant_entity',
    },
    {
      key: { tenantId: 1, 'steps.assignedTo': 1, 'steps.status': 1 },
      name: 'idx_winstance_tenant_assignee_status',
    },
    {
      key: { tenantId: 1, currentStepId: 1 },
      name: 'idx_winstance_tenant_current_step',
    },
    {
      /**
       * PHASE 5 -- THE IDEMPOTENCY CONSTRAINT.
       *
       * Phase 3 made event delivery at-least-once, so a redelivered
       * event called startWorkflow again and a SECOND approval instance
       * appeared for the same expense -- two managers asked to approve
       * one thing, two audit trails, and whichever was decided second
       * silently left the first in-flight.
       *
       * The engine's read-before-create handles the common case; THIS
       * index is what makes it correct when two handlers race past that
       * read simultaneously. The loser gets an 11000, which
       * startWorkflow catches and resolves by returning the winner's
       * instance.
       *
       * PARTIAL on `idempotencyKey: {$exists: true}`, because most
       * instances legitimately have no key -- a human starting a
       * workflow may raise two for the same entity on purpose. A plain
       * unique index would collapse every keyless instance in a tenant
       * into one, which would break manual starts entirely.
       */
      key: { tenantId: 1, idempotencyKey: 1 },
      name: 'uniq_winstance_tenant_idempotency',
      unique: true,
      partialFilterExpression: { idempotencyKey: { $exists: true } },
    },
    {
      /**
       * PHASE 5, F-14 -- org-unit scoped instance reads.
       *
       * Every instance list is now filtered by the caller's accessible
       * org units, so the predicate needs an index or each read scans
       * the tenant's whole instance history.
       */
      key: { tenantId: 1, orgUnitId: 1, status: 1, createdAt: -1 },
      name: 'idx_winstance_tenant_unit_status',
    },
  ],
} as const;