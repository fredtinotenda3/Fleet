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
  ],
} as const;