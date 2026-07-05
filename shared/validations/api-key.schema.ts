// shared/validations/api-key.schema.ts

import { z } from 'zod';

export const apiKeyCreateSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  permissions: z.array(z.string()).min(1, 'At least one permission is required'),
  expiresAt: z.union([z.string(), z.date()]).nullable().optional(),
});

export type ApiKeyCreateInput = z.infer<typeof apiKeyCreateSchema>;