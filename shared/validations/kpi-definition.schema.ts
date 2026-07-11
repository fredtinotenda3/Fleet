// shared/validations/kpi-definition.schema.ts

import { z } from 'zod';

const aggregationSchema = z.object({
  field: z.string().min(1),
  fn: z.enum(['sum', 'avg', 'count', 'min', 'max']),
  alias: z.string().min(1),
});

const filterConditionSchema = z.object({
  field: z.string().min(1),
  operator: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'contains', 'between']),
  value: z.unknown(),
  value2: z.unknown().optional(),
});

const thresholdSchema = z.object({
  warning: z.number(),
  critical: z.number(),
  direction: z.enum(['higher_is_better', 'lower_is_better']),
});

export const kpiDefinitionCreateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  dataSource: z.enum(['vehicles', 'expenses', 'fuel', 'maintenance', 'trips']),
  numerator: aggregationSchema,
  denominator: aggregationSchema.optional(),
  filters: z.array(filterConditionSchema).optional(),
  unit: z.string().max(10).optional(),
  threshold: thresholdSchema.optional(),
  targetValue: z.number().optional(),
});

export const kpiDefinitionUpdateSchema = kpiDefinitionCreateSchema.partial();

export type KpiDefinitionCreateInput = z.infer<typeof kpiDefinitionCreateSchema>;
export type KpiDefinitionUpdateInput = z.infer<typeof kpiDefinitionUpdateSchema>;