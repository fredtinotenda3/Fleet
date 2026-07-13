// frontend/modules/reports/schemas/executiveDashboard.ts
// Validates the filter bar state for the Executive Dashboard. This governs
// what gets sent to dashboardsApi.render(id) as query context and what gets
// persisted to the URL/search params so a filtered view is shareable.

import { z } from 'zod';

export const DATE_PRESETS = [
  'today',
  'yesterday',
  'last7Days',
  'last30Days',
  'thisMonth',
  'lastMonth',
  'thisQuarter',
  'lastQuarter',
  'thisYear',
  'lastYear',
  'custom',
] as const;

export type DatePreset = (typeof DATE_PRESETS)[number];

export const executiveDashboardFilterSchema = z
  .object({
    organizationId: z.string().min(1).optional(),
    datePreset: z.enum(DATE_PRESETS).default('last30Days'),
    dateFrom: z.string().datetime().optional(),
    dateTo: z.string().datetime().optional(),
    vehicleIds: z.array(z.string()).default([]),
    departmentIds: z.array(z.string()).default([]),
    tags: z.array(z.string()).default([]),
    compareToPreviousPeriod: z.boolean().default(true),
  })
  .refine(
    (val) => val.datePreset !== 'custom' || (!!val.dateFrom && !!val.dateTo),
    { message: 'A custom date range requires both a start and end date.', path: ['dateFrom'] },
  )
  .refine(
    (val) => !val.dateFrom || !val.dateTo || new Date(val.dateFrom) <= new Date(val.dateTo),
    { message: 'Start date must be on or before the end date.', path: ['dateTo'] },
  );

export type ExecutiveDashboardFilter = z.infer<typeof executiveDashboardFilterSchema>;

export const defaultExecutiveDashboardFilter: ExecutiveDashboardFilter = {
  datePreset: 'last30Days',
  vehicleIds: [],
  departmentIds: [],
  tags: [],
  compareToPreviousPeriod: true,
};