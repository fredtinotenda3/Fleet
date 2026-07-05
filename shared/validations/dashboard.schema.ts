
// shared/validations/dashboard.schema.ts

import { z } from 'zod';

const widgetLayoutSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number().positive(),
  h: z.number().positive(),
});

const widgetSchema = z
  .object({
    id: z.string().min(1),
    type: z.enum(['kpi', 'chart', 'table', 'pivot']),
    title: z.string().min(1),
    reportDefinitionId: z.string().optional(),
    kpiDefinitionId: z.string().optional(),
    layout: widgetLayoutSchema,
  })
  .refine((w) => (w.type === 'kpi' ? !!w.kpiDefinitionId : !!w.reportDefinitionId), {
    message: 'kpi widgets require kpiDefinitionId; chart/table/pivot widgets require reportDefinitionId',
  });

export const dashboardCreateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  isExecutive: z.boolean().optional(),
  widgets: z.array(widgetSchema).optional(),
});

export const dashboardUpdateSchema = dashboardCreateSchema.partial();