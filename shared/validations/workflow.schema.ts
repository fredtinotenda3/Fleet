// shared/validations/workflow.schema.ts

import { z } from 'zod';

const workflowStepSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(200),
  type: z.enum(['approval', 'notification', 'task', 'webhook', 'condition']),
  assignee: z.array(z.string()).optional(),
  role: z.string().optional(),
  timeout: z.number().positive().optional(),
  nextSteps: z.array(z.string()),
  config: z.record(z.string(), z.unknown()).optional(),
});

const workflowTriggerSchema = z.object({
  event: z.string().min(1),
  conditions: z.record(z.string(), z.unknown()).optional(),
  filter: z.string().optional(),
});

const workflowConfigSchema = z.object({
  requireAllApprovals: z.boolean().optional(),
  escalationTimeout: z.number().positive().optional(),
  autoApproveAfter: z.number().positive().optional(),
  notifyOnCompletion: z.boolean().optional(),
  allowSelfApproval: z.boolean().optional(),
});

export const workflowCreateSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  type: z.enum(['expense_approval', 'maintenance_approval', 'onboarding', 'incident']),
  steps: z.array(workflowStepSchema).min(1, 'At least one step is required'),
  triggers: z.array(workflowTriggerSchema).default([]),
  config: workflowConfigSchema.default({}),
  status: z.enum(['active', 'inactive', 'draft']).default('draft'),
  version: z.number().int().positive().default(1),
}).superRefine((data, ctx) => {
  const stepIds = new Set(data.steps.map((s) => s.id));
  data.steps.forEach((step, index) => {
    step.nextSteps.forEach((nextId) => {
      if (!stepIds.has(nextId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Step "${step.id}" references unknown nextStep "${nextId}"`,
          path: ['steps', index, 'nextSteps'],
        });
      }
    });
  });
});

export const workflowUpdateSchema = workflowCreateSchema.partial();

export const workflowStartSchema = z.object({
  workflowId: z.string().min(1),
  entityId: z.string().min(1),
  entityType: z.string().min(1),
});

export const workflowApproveSchema = z.object({
  comment: z.string().max(1000).optional().default(''),
});

export const workflowRejectSchema = z.object({
  reason: z.string().min(1, 'Rejection reason is required').max(1000),
});

export type WorkflowCreateInput = z.infer<typeof workflowCreateSchema>;
export type WorkflowUpdateInput = z.infer<typeof workflowUpdateSchema>;
export type WorkflowStartInput = z.infer<typeof workflowStartSchema>;