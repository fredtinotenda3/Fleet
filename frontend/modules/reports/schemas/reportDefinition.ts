// frontend/modules/reports/schemas/reportDefinition.ts
//
// The client-side shape of a report definition as edited in the builder.
// Maps 1:1 onto ReportDefinitionCreateDTO/UpdateDTO consumed by
// reportDefinitionsApi (frontend/modules/reports/services/reports.api.ts),
// which in turn hits report-definition.controller.ts -> report-builder.service.ts.

import { z } from 'zod';
import { reportColumnListSchema } from './reportColumn';
import { reportFilterGroupSchema } from './reportFilter';

export const REPORT_DATA_SOURCES = [
  'vehicles',
  'trips',
  'fuel',
  'maintenance',
  'expenses',
  'organizations',
] as const;
export type ReportDataSource = (typeof REPORT_DATA_SOURCES)[number];

export const reportSortSchema = z.object({
  field: z.string().min(1),
  direction: z.enum(['asc', 'desc']),
});
export type ReportSort = z.infer<typeof reportSortSchema>;

export const reportScheduleSchema = z
  .object({
    enabled: z.boolean().default(false),
    cron: z.string().optional(),
    timezone: z.string().default('UTC'),
    recipients: z.array(z.string().email()).default([]),
  })
  .refine((s) => !s.enabled || !!s.cron, {
    message: 'A cron schedule is required when scheduling is enabled.',
    path: ['cron'],
  })
  .refine((s) => !s.enabled || s.recipients.length > 0, {
    message: 'At least one recipient is required when scheduling is enabled.',
    path: ['recipients'],
  });
export type ReportScheduleConfig = z.infer<typeof reportScheduleSchema>;

export const reportDefinitionFormSchema = z.object({
  name: z.string().min(1, 'Name is required.').max(120),
  description: z.string().max(500).optional(),
  dataSource: z.enum(REPORT_DATA_SOURCES),
  columns: reportColumnListSchema,
  filters: reportFilterGroupSchema,
  groupBy: z.array(z.string()).default([]),
  sort: z.array(reportSortSchema).default([]),
  limit: z.number().int().positive().max(50_000).default(1000),
  isPivot: z.boolean().default(false),
  pivotRowField: z.string().optional(),
  pivotColumnField: z.string().optional(),
  pivotValueField: z.string().optional(),
  schedule: reportScheduleSchema.optional(),
  isShared: z.boolean().default(false),
  tags: z.array(z.string()).default([]),
});

export type ReportDefinitionForm = z.infer<typeof reportDefinitionFormSchema>;

export const defaultReportDefinitionForm: ReportDefinitionForm = {
  name: '',
  dataSource: 'vehicles',
  columns: [] as unknown as ReportDefinitionForm['columns'],
  filters: { logic: 'and', conditions: [] },
  groupBy: [],
  sort: [],
  limit: 1000,
  isPivot: false,
  isShared: false,
  tags: [],
};