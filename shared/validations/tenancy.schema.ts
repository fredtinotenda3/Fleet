// shared/validations/tenancy.schema.ts

import { z } from 'zod';

export const platformOrgStatusSchema = z.object({
  status: z.enum(['active', 'suspended', 'archived']),
  reason: z.string().max(500).optional(),
});

export const moveOrgUnitSchema = z.object({
  newParentId: z.string().nullable(),
});

export type PlatformOrgStatusInput = z.infer<typeof platformOrgStatusSchema>;
export type MoveOrgUnitInput = z.infer<typeof moveOrgUnitSchema>;