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

// FIX (Critical — ".partial() cannot be used on object schemas containing
// refinements"): workflowCreateSchema used to be defined as
// z.object({...}).superRefine(...) directly, which returns a ZodEffects
// wrapper, not a plain ZodObject. workflowUpdateSchema then called
// `.partial()` on that ZodEffects instance, which Zod does not support —
// this threw at *module load time* (not just when a bad payload came in),
// which is why every route importing this schema failed to even collect
// page data at build time, with the failure surfacing in whichever route
// happened to be evaluated first (my-tasks / [id]/steps/[stepId] /
// instances). Fixed by keeping the plain object schema (`workflowBaseSchema`)
// separate from its refinement, so `.partial()` has a real ZodObject to
// operate on. The step-reference refinement is then reattached to both the
// create schema (steps required) and the update schema (steps optional —
// only validated if the caller is actually updating steps in this call).
const workflowBaseSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  type: z.enum(['expense_approval', 'maintenance_approval', 'onboarding', 'incident']),
  steps: z.array(workflowStepSchema).min(1, 'At least one step is required'),
  triggers: z.array(workflowTriggerSchema).default([]),
  config: workflowConfigSchema.default({}),
  status: z.enum(['active', 'inactive', 'draft']).default('draft'),
  version: z.number().int().positive().default(1),
});

/**
 * Shared "every nextSteps id must point at a step that actually exists in
 * this payload" check. Used by both the create schema (steps always
 * present) and the update schema (steps present only if the caller sent
 * a new steps array).
 */
function validateStepReferences(
  data: { steps?: { id: string; nextSteps: string[] }[] },
  ctx: z.RefinementCtx
) {
  if (!data.steps) return;
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
}

export const workflowCreateSchema = workflowBaseSchema.superRefine(validateStepReferences);

// Built from the plain object schema (workflowBaseSchema), not from
// workflowCreateSchema, so .partial() is valid here. The step-reference
// refinement is reapplied afterward, and now tolerates a missing `steps`
// field since partial updates may not touch steps at all.
export const workflowUpdateSchema = workflowBaseSchema.partial().superRefine(validateStepReferences);

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