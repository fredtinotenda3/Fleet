
// shared/validations/report-template.schema.ts

import { z } from 'zod';
import { reportDefinitionCreateSchema } from './report-definition.schema';

export const reportTemplateCreateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  category: z.enum(['fleet_overview', 'cost_analysis', 'maintenance', 'fuel_efficiency', 'utilization', 'custom']),
  definition: reportDefinitionCreateSchema,
});

export const reportTemplateInstantiateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
});