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