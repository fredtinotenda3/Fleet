// shared/validations/rule.schema.ts

import { z } from 'zod';

const operatorSchema = z.enum([
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'in',
  'not_in',
  'contains',
  'not_contains',
  'starts_with',
  'ends_with',
  'exists',
  'not_exists',
]);

/**
 * Recursive schema for the condition tree. z.lazy() is required because
 * RuleConditionGroup references itself through `conditions`.
 */
const ruleConditionSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.object({
      field: z.string().min(1, 'Condition field is required'),
      operator: operatorSchema,
      value: z.unknown().optional(),
    }),
    ruleConditionGroupSchema,
  ])
);

const ruleConditionGroupSchema: z.ZodType<unknown> = z.lazy(() =>
  z.object({
    type: z.enum(['AND', 'OR']),
    conditions: z.array(ruleConditionSchema).min(1, 'At least one condition is required'),
  })
);

const ruleActionSchema = z.object({
  type: z.string().min(1, 'Action type is required'),
  params: z.record(z.string(), z.unknown()).default({}),
});

export const ruleCreateSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200, 'Name too long'),
  description: z.string().max(1000).optional(),
  category: z.string().min(1, 'Category is required').max(50),
  trigger: z.string().min(1, 'Trigger event is required').max(100),
  conditions: ruleConditionGroupSchema,
  actions: z.array(ruleActionSchema).min(1, 'At least one action is required'),
  priority: z.number().int().min(0).max(10000).default(100),
  status: z.enum(['active', 'inactive', 'draft']).default('draft'),
  version: z.number().int().positive().default(1),
  variables: z.record(z.string(), z.unknown()).optional(),
  stopOnMatch: z.boolean().default(false),
  tags: z.array(z.string().max(30)).max(20).optional(),
});

export const ruleUpdateSchema = ruleCreateSchema.partial();

export const ruleTestSchema = z.object({
  context: z.record(z.string(), z.unknown()),
});

export const ruleEvaluateTriggerSchema = z.object({
  trigger: z.string().min(1, 'trigger is required'),
  context: z.record(z.string(), z.unknown()).default({}),
});

export type RuleCreateInput = z.infer<typeof ruleCreateSchema>;
export type RuleUpdateInput = z.infer<typeof ruleUpdateSchema>;
export type RuleTestInput = z.infer<typeof ruleTestSchema>;
export type RuleEvaluateTriggerInput = z.infer<typeof ruleEvaluateTriggerSchema>;