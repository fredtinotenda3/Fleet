
// shared/validations/report-execution.schema.ts

import { z } from 'zod';

const filterConditionSchema = z.object({
  field: z.string().min(1),
  operator: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'contains', 'between']),
  value: z.unknown(),
  value2: z.unknown().optional(),
});

export const generateExecutionSchema = z
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