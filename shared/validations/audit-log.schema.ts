// shared/validations/audit-log.schema.ts

import { z } from 'zod';

export const auditLogQuerySchema = z.object({
  tenantId: z.string().optional(),
  category: z.enum(['domain', 'security', 'system']).optional(),
  severity: z.enum(['info', 'warning', 'critical']).optional(),
  action: z.string().max(200).optional(),
  entityType: z.string().max(50).optional(),
  entityId: z.string().max(100).optional(),
  userId: z.string().max(100).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const accountUnlockSchema = z.object({
  reason: z.string().max(500).optional(),
});

export type AuditLogQueryInput = z.infer<typeof auditLogQuerySchema>;