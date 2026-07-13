// shared/validations/dashboard.schema.ts
//
// FIX (Critical): dashboard.controller.ts imports
// `dashboardCreateSchema`/`dashboardUpdateSchema` from this exact path,
// but the file did not exist anywhere in the codebase. Any request to
// POST/PUT /api/reporting/dashboards would throw a module-resolution
// error at import time, taking down the entire dashboards route (list/get
// were unaffected since they don't import the schemas, but the module
// itself would fail to load in any bundler that eagerly evaluates
// imports). Mirrors the shape of DashboardCreateDTO/DashboardUpdateDTO in
// modules/reporting/types/dashboard.types.ts and follows the same
// zod conventions as report-definition.schema.ts.

import { z } from 'zod';

const dashboardWidgetConfigSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['kpi', 'table', 'chart', 'pivot']),
  title: z.string().min(1).max(200),
  kpiDefinitionId: z.string().optional(),
  reportDefinitionId: z.string().optional(),
  layout: z
    .object({
      x: z.number().int().min(0),
      y: z.number().int().min(0),
      w: z.number().int().min(1),
      h: z.number().int().min(1),
    })
    .optional(),
});

export const dashboardCreateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  isExecutive: z.boolean().optional(),
  widgets: z.array(dashboardWidgetConfigSchema).optional(),
});

export const dashboardUpdateSchema = dashboardCreateSchema.partial();

export type DashboardCreateInput = z.infer<typeof dashboardCreateSchema>;
export type DashboardUpdateInput = z.infer<typeof dashboardUpdateSchema>;