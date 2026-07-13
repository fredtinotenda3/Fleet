// shared/validations/kpi-definition.schema.ts
//
// FIX (Critical): kpi-definition.controller.ts imports
// `kpiDefinitionCreateSchema`/`kpiDefinitionUpdateSchema` from this exact
// path, but the file did not exist anywhere in the codebase — the same
// class of bug as the missing dashboard.schema.ts. Every KPI create/update
// request, and by extension the whole kpi-definition.controller.ts module,
// would fail to import. Mirrors KPIDefinitionCreateDTO/UpdateDTO in
// modules/reporting/types/kpi.types.ts, reusing the same filter/aggregation
// primitives already validated in report-definition.schema.ts so the two
// stay in sync.

import { z } from 'zod';

const reportFilterConditionSchema = z.object({
  field: z.string().min(1),
  operator: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'contains', 'between']),
  value: z.unknown(),
  value2: z.unknown().optional(),
});

const reportAggregationSchema = z.object({
  field: z.string().min(1),
  fn: z.enum(['sum', 'avg', 'count', 'min', 'max']),
  alias: z.string().min(1),
});

const kpiThresholdSchema = z.object({
  warning: z.number(),
  critical: z.number(),
  direction: z.enum(['higher_is_better', 'lower_is_better']),
});

export const kpiDefinitionCreateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  dataSource: z.enum(['vehicles', 'expenses', 'fuel', 'maintenance', 'trips']),
  numerator: reportAggregationSchema,
  denominator: reportAggregationSchema.optional(),
  filters: z.array(reportFilterConditionSchema).optional(),
  unit: z.string().max(20).optional(),
  threshold: kpiThresholdSchema.optional(),
  targetValue: z.number().optional(),
});

export const kpiDefinitionUpdateSchema = kpiDefinitionCreateSchema.partial();

export type KpiDefinitionCreateInput = z.infer<typeof kpiDefinitionCreateSchema>;
export type KpiDefinitionUpdateInput = z.infer<typeof kpiDefinitionUpdateSchema>;