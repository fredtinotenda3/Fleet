// modules/workflows/types/workflow.types.ts

import { BaseEntity } from '@/shared/types/common.types';

export interface Workflow extends BaseEntity {
  name: string;
  type: WorkflowType;
  steps: WorkflowStep[];
  triggers: WorkflowTrigger[];
  config: WorkflowConfig;
  status: 'active' | 'inactive' | 'draft';
  version: number;
}

export type WorkflowType = 'expense_approval' | 'maintenance_approval' | 'onboarding' | 'incident';

export interface WorkflowStep {
  id: string;
  name: string;
  type: 'approval' | 'notification' | 'task' | 'webhook' | 'condition';
  assignee?: string[];
  role?: string;
  timeout?: number; // hours
  nextSteps: string[];
  config?: Record<string, any>;
}

export interface WorkflowTrigger {
  event: string;
  conditions?: Record<string, any>;
  filter?: string;
}

export interface WorkflowConfig {
  requireAllApprovals?: boolean;
  escalationTimeout?: number;
  autoApproveAfter?: number;
  notifyOnCompletion?: boolean;
  allowSelfApproval?: boolean;
}

export interface WorkflowInstance extends BaseEntity {
  workflowId: string;
  entityId: string;
  entityType: string;
  /**
   * PHASE 5, F-14 -- which org unit this instance belongs to.
   *
   * DEFINITIONS STAY ORGANIZATION-LEVEL; INSTANCES DO NOT. A `Workflow`
   * is company-wide approval POLICY -- "purchases over $5,000 need a
   * manager" applies everywhere, and scoping it per branch would mean
   * maintaining N copies that drift. An INSTANCE is one branch's actual
   * request, and a Bulawayo manager has no business reading, approving
   * or cancelling Harare's.
   *
   * Before Phase 5 every WorkflowEngine method took a bare `tenantId`,
   * so the caller's accessible org units were discarded at the door:
   * holding WORKFLOW_APPROVE made every branch manager
   * indistinguishable from every other at the permission layer.
   *
   * DERIVED FROM THE TARGET ENTITY, never from a request body -- see
   * workflow-ownership.resolver.ts, which follows the pattern
   * attention-ownership.resolver.ts established in Phase 0.
   *
   * Optional because instances written before Phase 5 do not have it,
   * and because a genuinely organization-wide subject (an onboarding
   * workflow for the company itself) legitimately has no unit. Both
   * cases are handled the same way by the scope predicate: absent
   * orgUnitId is visible only to organization-wide callers, never
   * broadcast to every unit.
   */
  orgUnitId?: string;
  /**
   * PHASE 5 -- deterministic de-duplication key.
   *
   * Phase 3 made event delivery at-least-once: the outbox processor can
   * redeliver an event whose handlers already ran (a crash between
   * dispatch and completion). `WorkflowTriggerHandler` then called
   * `startWorkflow` again and a SECOND approval instance appeared for
   * the same expense -- two managers asked to approve the same thing,
   * two audit trails, and whichever was approved second silently
   * overwrote the first's outcome.
   *
   * Backed by a partial unique index (see indexes.workflows-addendum),
   * so the guarantee is enforced by the database rather than by a
   * read-then-write check that two concurrent handlers can interleave.
   *
   * Optional: a human clicking "start workflow" in the UI has no natural
   * dedupe key and does not need one -- they can legitimately raise two
   * requests for the same entity. Only automated starts (event handlers,
   * rule actions) supply one. See buildWorkflowIdempotencyKey.
   */
  idempotencyKey?: string;
  currentStepId: string;
  status: 'pending' | 'in_progress' | 'approved' | 'rejected' | 'cancelled';
  steps: WorkflowStepInstance[];
  metadata: Record<string, any>;
  createdBy: string;
  completedAt?: Date;
}

export interface WorkflowStepInstance {
  stepId: string;
  status: 'pending' | 'in_progress' | 'approved' | 'rejected' | 'skipped';
  assignedTo?: string[];
  approvedBy?: string;
  approvedAt?: Date;
  comments?: string;
  startedAt?: Date;
  completedAt?: Date;
}