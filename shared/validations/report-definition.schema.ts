
// shared/validations/report-definition.schema.ts

import { z } from 'zod';

const filterConditionSchema = z.object({
  field: z.string().min(1),
  operator: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'contains', 'between']),
  value: z.unknown(),
  value2: z.unknown().optional(),
});

const groupBySchema = z.object({ field: z.string().min(1), label: z.string().optional() });

const aggregationSchema = z.object({
  field: z.string().min(1),
  fn: z.enum(['sum', 'avg', 'count', 'min', 'max']),
  alias: z.string().min(1),
});

const sortSchema = z.object({ field: z.string().min(1), direction: z.enum(['asc', 'desc']) });

const pivotConfigSchema = z.object({
  rowFields: z.array(z.string().min(1)).min(1),
  columnField: z.string().min(1),
  valueField: z.string().min(1),
  aggregator: z.enum(['sum', 'avg', 'count', 'min', 'max']),
});

const chartConfigSchema = z.object({
  type: z.enum(['bar', 'line', 'pie', 'table']),
  xField: z.string().optional(),
  yField: z.string().optional(),
});

const scheduleConfigSchema = z.object({
  enabled: z.boolean(),
  frequency: z.enum(['daily', 'weekly', 'monthly']),
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  dayOfMonth: z.number().int().min(1).max(28).optional(),
  hourOfDay: z.number().int().min(0).max(23),
  format: z.enum(['pdf', 'excel', 'csv', 'word', 'json']),
  recipients: z.array(z.string().email()).min(1),
});

export const reportDefinitionCreateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  dataSource: z.enum(['vehicles', 'expenses', 'fuel', 'maintenance', 'trips']),
  fields: z.array(z.string().min(1)).min(1),
  filters: z.array(filterConditionSchema).optional(),
  groupBy: z.array(groupBySchema).optional(),
  aggregations: z.array(aggregationSchema).optional(),
  sort: z.array(sortSchema).optional(),
  pivot: pivotConfigSchema.optional(),
  chart: chartConfigSchema.optional(),
  schedule: scheduleConfigSchema.optional(),
});

export const reportDefinitionUpdateSchema = reportDefinitionCreateSchema.partial();

export type ReportDefinitionCreateInput = z.infer<typeof reportDefinitionCreateSchema>;
export type ReportDefinitionUpdateInput = z.infer<typeof reportDefinitionUpdateSchema>;