// frontend/modules/workflows/types/index.ts
//
// Mirrors modules/workflows/types/workflow.types.ts field-for-field.
// There is no separate shared/types/workflow.types.ts client mirror, so
// (same pattern as observability/types/index.ts uses for its backend
// response) this module owns its own copy rather than importing the
// backend module's types directly -- workflows/types/workflow.types.ts
// lives under modules/ (server-only code), and frontend modules do not
// import server-tree files.
//
// NOTE ON WHAT THIS MODULE CAN LIST: GET /api/workflows/instances is
// wired to WorkflowController.getInstancesForEntity, which REQUIRES
// entityId and entityType query params (see
// app/api/workflows/instances/route.ts and workflow.controller.ts) --
// there is no general "list every instance in my scope" endpoint on
// the wire today, even though workflowRepository.getInstancesInScope
// exists server-side. This module's instances page is therefore built
// around an entity lookup, not a free browse, and WorkflowInstanceListParams
// reflects that: entityId/entityType are required, not optional filters.

export type WorkflowType = 'expense_approval' | 'maintenance_approval' | 'onboarding' | 'incident';

export type WorkflowStatus = 'active' | 'inactive' | 'draft';

export type WorkflowStepType = 'approval' | 'notification' | 'task' | 'webhook' | 'condition';

export interface WorkflowStep {
  id: string;
  name: string;
  type: WorkflowStepType;
  assignee?: string[];
  role?: string;
  /** Hours. */
  timeout?: number;
  nextSteps: string[];
  config?: Record<string, unknown>;
}

export interface WorkflowTrigger {
  event: string;
  conditions?: Record<string, unknown>;
  filter?: string;
}

export interface WorkflowConfig {
  requireAllApprovals?: boolean;
  escalationTimeout?: number;
  autoApproveAfter?: number;
  notifyOnCompletion?: boolean;
  allowSelfApproval?: boolean;
}

/** Mirrors Workflow (workflow definition) from modules/workflows/types/workflow.types.ts. */
export interface WorkflowDefinition {
  _id?: string;
  tenantId: string;
  name: string;
  type: WorkflowType;
  steps: WorkflowStep[];
  triggers: WorkflowTrigger[];
  config: WorkflowConfig;
  status: WorkflowStatus;
  version: number;
  createdAt?: string;
  updatedAt?: string;
}

export type WorkflowInstanceStatus = 'pending' | 'in_progress' | 'approved' | 'rejected' | 'cancelled';

export type WorkflowStepInstanceStatus = 'pending' | 'in_progress' | 'approved' | 'rejected' | 'skipped';

export interface WorkflowStepInstance {
  stepId: string;
  status: WorkflowStepInstanceStatus;
  assignedTo?: string[];
  approvedBy?: string;
  approvedAt?: string;
  comments?: string;
  startedAt?: string;
  completedAt?: string;
}

/** Mirrors WorkflowInstance from modules/workflows/types/workflow.types.ts. */
export interface WorkflowInstance {
  _id?: string;
  tenantId: string;
  workflowId: string;
  entityId: string;
  entityType: string;
  /**
   * Which org unit this instance belongs to. Optional -- absent on
   * instances predating this field, and on genuinely org-wide
   * subjects. See the backend type's own comment
   * (modules/workflows/types/workflow.types.ts) for why this is
   * derived server-side from the target entity and never accepted
   * from a client payload.
   */
  orgUnitId?: string;
  idempotencyKey?: string;
  currentStepId: string;
  status: WorkflowInstanceStatus;
  steps: WorkflowStepInstance[];
  metadata: Record<string, unknown>;
  createdBy: string;
  createdAt?: string;
  updatedAt?: string;
  completedAt?: string;
}

/** A workflow instance's current step, joined with its definition for display. Frontend-only convenience shape. */
export interface WorkflowMyTask {
  instance: WorkflowInstance;
  workflow?: WorkflowDefinition;
}

/** Response of GET /api/workflows/metrics (workflowRepository.getWorkflowMetrics). */
export interface WorkflowMetrics {
  total: number;
  byStatus: Record<string, number>;
  avgCompletionTimeMs: number | null;
}

// ── Frontend-only request/params shapes ──────────────────────────────

/** Body accepted by POST /api/workflows and PUT /api/workflows/[id] (see shared/validations/workflow.schema.ts). */
export interface WorkflowCreatePayload {
  name: string;
  type: WorkflowType;
  steps: WorkflowStep[];
  triggers?: WorkflowTrigger[];
  config?: WorkflowConfig;
  status?: WorkflowStatus;
  version?: number;
}

export type WorkflowUpdatePayload = Partial<WorkflowCreatePayload>;

/** Query params accepted by GET /api/workflows (workflowController.listWorkflows). */
export interface WorkflowListParams {
  activeOnly?: boolean;
}

/**
 * Query params REQUIRED by GET /api/workflows/instances
 * (workflowController.getInstancesForEntity throws ValidationError if
 * either is missing).
 */
export interface WorkflowInstanceListParams {
  entityId: string;
  entityType: string;
}

/** Body accepted by POST /api/workflows/instances (workflowStartSchema). */
export interface WorkflowStartPayload {
  workflowId: string;
  entityId: string;
  entityType: string;
}

/** Body accepted by the approve endpoint (workflowApproveSchema). */
export interface WorkflowApprovePayload {
  comment?: string;
}

/** Body accepted by the reject endpoint (workflowRejectSchema) -- reason is required server-side. */
export interface WorkflowRejectPayload {
  reason: string;
}

export const WORKFLOW_STATUSES: WorkflowStatus[] = ['active', 'inactive', 'draft'];

export const WORKFLOW_STATUS_LABELS: Record<WorkflowStatus, string> = {
  active: 'Active',
  inactive: 'Inactive',
  draft: 'Draft',
};

export const WORKFLOW_TYPE_LABELS: Record<WorkflowType, string> = {
  expense_approval: 'Expense approval',
  maintenance_approval: 'Maintenance approval',
  onboarding: 'Onboarding',
  incident: 'Incident',
};

export const WORKFLOW_INSTANCE_STATUS_LABELS: Record<WorkflowInstanceStatus, string> = {
  pending: 'Pending',
  in_progress: 'In progress',
  approved: 'Approved',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

export const WORKFLOW_STEP_STATUS_LABELS: Record<WorkflowStepInstanceStatus, string> = {
  pending: 'Pending',
  in_progress: 'In progress',
  approved: 'Approved',
  rejected: 'Rejected',
  skipped: 'Skipped',
};
