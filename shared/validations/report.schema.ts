// shared/validations/report.schema.ts

import { z } from 'zod';

export const reportTypeSchema = z.enum([
  'fleet_summary',
  'expense_analysis',
  'fuel_efficiency',
  'maintenance_history',
  'trip_logs',
]);

export const reportFormatSchema = z.enum(['pdf', 'csv', 'excel']);

const dateRangeSchema = z.object({
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
}).refine((data) => data.startDate <= data.endDate, {
  message: 'startDate must be before endDate',
  path: ['startDate'],
});

const reportScheduleSchema = z.object({
  enabled: z.boolean(),
  frequency: z.enum(['daily', 'weekly', 'monthly']),
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  dayOfMonth: z.number().int().min(1).max(31).optional(),
  recipients: z.array(z.string().email()).min(1, 'At least one recipient is required'),
});

export const reportConfigSchema = z.object({
  type: reportTypeSchema,
  format: reportFormatSchema,
  dateRange: dateRangeSchema,
  filters: z.record(z.string(), z.unknown()).optional(),
  includeCharts: z.boolean().optional(),
  includeDetails: z.boolean().optional(),
  schedule: reportScheduleSchema.optional(),
});

export type ReportConfigInput = z.infer<typeof reportConfigSchema>;