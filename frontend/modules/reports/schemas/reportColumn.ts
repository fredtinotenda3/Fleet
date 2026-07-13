// frontend/modules/reports/schemas/reportColumn.ts
//
// A report column is a field pulled from one of the registered data sources
// (see modules/reporting/registry/DataSourceRegistry.ts on the backend -
// vehicles, trips, fuel, maintenance, expenses, organizations). The builder
// only lets users pick from the field list the backend actually exposes for
// the selected data source, so this schema validates shape, not the field
// name itself - field-name validity is enforced server-side against the
// registry when the definition is saved/previewed.

import { z } from 'zod';

export const AGGREGATION_FUNCTIONS = [
  'none',
  'sum',
  'avg',
  'min',
  'max',
  'count',
  'countDistinct',
] as const;
export type AggregationFunction = (typeof AGGREGATION_FUNCTIONS)[number];

export const reportColumnSchema = z.object({
  id: z.string().min(1),
  field: z.string().min(1),
  label: z.string().min(1).max(80),
  dataSource: z.string().min(1),
  dataType: z.enum(['string', 'number', 'currency', 'percent', 'date', 'boolean']),
  aggregation: z.enum(AGGREGATION_FUNCTIONS).default('none'),
  visible: z.boolean().default(true),
  width: z.number().int().positive().optional(),
});

export type ReportColumn = z.infer<typeof reportColumnSchema>;

export const reportColumnListSchema = z
  .array(reportColumnSchema)
  .min(1, 'Select at least one column.')
  .refine(
    (cols) => new Set(cols.map((c) => c.id)).size === cols.length,
    'Duplicate column selected.',
  );