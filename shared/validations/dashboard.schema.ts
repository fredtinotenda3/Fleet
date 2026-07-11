// shared/validations/dashboard.schema.ts

import { z } from 'zod';

const dashboardWidgetSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['kpi', 'table', 'chart', 'pivot']),
  title: z.string().min(1),
  kpiDefinitionId: z.string().optional(),
  reportDefinitionId: z.string().optional(),
  layout: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }).optional(),
});

export const dashboardCreateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  isExecutive: z.boolean().optional(),
  widgets: z.array(dashboardWidgetSchema).optional(),
});

export const dashboardUpdateSchema = dashboardCreateSchema.partial();

export type DashboardCreateInput = z.infer<typeof dashboardCreateSchema>;
export type DashboardUpdateInput = z.infer<typeof dashboardUpdateSchema>;