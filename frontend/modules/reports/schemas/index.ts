// frontend/modules/reports/schemas/index.ts
//
// Mirrors shared/validations/report-definition.schema.ts,
// report-template.schema.ts and report-execution.schema.ts. Kept
// separate (not imported) because those live under shared/validations
// and could be imported directly -- but duplicating here keeps the
// Reports module self-contained and lets the form show validation errors
// before a round-trip, while the server schemas remain the actual
// enforcement point.

import { z } from 'zod';

export const filterConditionSchema = z.object({
  field: z.string().min(1, 'Field is required'),
  operator: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'contains', 'between']),
  value: z.unknown(),
  value2: z.unknown().optional(),
});

export const groupBySchema = z.object({
  field: z.string().min(1),
  label: z.string().optional(),
});

export const aggregationSchema = z.object({
  field: z.string().min(1),
  fn: z.enum(['sum', 'avg', 'count', 'min', 'max']),
  alias: z.string().min(1, 'Give this aggregate a name'),
});

export const sortFieldSchema = z.object({
  field: z.string().min(1),
  direction: z.enum(['asc', 'desc']),
});

export const pivotConfigSchema = z.object({
  rowFields: z.array(z.string().min(1)).min(1, 'Pick at least one row field'),
  columnField: z.string().min(1),
  valueField: z.string().min(1),
  aggregator: z.enum(['sum', 'avg', 'count', 'min', 'max']),
});

export const chartConfigSchema = z.object({
  type: z.enum(['bar', 'line', 'pie', 'table']),
  xField: z.string().optional(),
  yField: z.string().optional(),
});

export const scheduleConfigSchema = z.object({
  enabled: z.boolean(),
  frequency: z.enum(['daily', 'weekly', 'monthly']),
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  dayOfMonth: z.number().int().min(1).max(28).optional(),
  hourOfDay: z.number().int().min(0).max(23),
  format: z.enum(['pdf', 'excel', 'csv', 'word', 'json']),
  recipients: z.array(z.string().email('Enter a valid email')).min(1, 'Add at least one recipient'),
});

export const reportDefinitionFormSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  description: z.string().max(1000).optional(),
  dataSource: z.enum(['vehicles', 'expenses', 'fuel', 'maintenance', 'trips']),
  fields: z.array(z.string().min(1)).min(1, 'Select at least one field'),
  filters: z.array(filterConditionSchema).default([]),
  groupBy: z.array(groupBySchema).default([]),
  aggregations: z.array(aggregationSchema).default([]),
  sort: z.array(sortFieldSchema).default([]),
  pivot: pivotConfigSchema.optional(),
  chart: chartConfigSchema.optional(),
  schedule: scheduleConfigSchema.optional(),
});

export type ReportDefinitionFormValues = z.infer<typeof reportDefinitionFormSchema>;

export const kpiDefinitionFormSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  description: z.string().max(1000).optional(),
  dataSource: z.enum(['vehicles', 'expenses', 'fuel', 'maintenance', 'trips']),
  numerator: aggregationSchema,
  denominator: aggregationSchema.optional(),
  filters: z.array(filterConditionSchema).default([]),
  unit: z.string().max(20).optional(),
  threshold: z
    .object({
      warning: z.number(),
      critical: z.number(),
      direction: z.enum(['higher_is_better', 'lower_is_better']),
    })
    .optional(),
  targetValue: z.number().optional(),
});

export type KpiDefinitionFormValues = z.infer<typeof kpiDefinitionFormSchema>;

export const generateExecutionFormSchema = z
  .object({
    reportDefinitionId: z.string().optional(),
    dashboardId: z.string().optional(),
    format: z.enum(['pdf', 'excel', 'csv', 'word', 'json']),
    drilldownFilters: z.array(filterConditionSchema).optional(),
    emailTo: z.array(z.string().email()).optional(),
  })
  .refine((data) => !!data.reportDefinitionId !== !!data.dashboardId, {
    message: 'Exactly one of reportDefinitionId or dashboardId must be provided',
  });