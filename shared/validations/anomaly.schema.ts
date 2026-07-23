// shared/validations/anomaly.schema.ts

import { z } from 'zod';

export const anomalyListQuerySchema = z.object({
  category: z.enum(['fuel', 'expense', 'maintenance']).optional(),
  severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  status: z.enum(['open', 'acknowledged', 'resolved', 'dismissed']).optional(),
  licensePlate: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(25),
});

export const anomalyStatusUpdateSchema = z.object({
  status: z.enum(['acknowledged', 'resolved', 'dismissed']),
});

export type AnomalyListQuery = z.infer<typeof anomalyListQuerySchema>;
export type AnomalyStatusUpdateInput = z.infer<typeof anomalyStatusUpdateSchema>;