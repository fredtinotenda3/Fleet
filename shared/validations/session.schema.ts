// shared/validations/session.schema.ts

import { z } from 'zod';

export const sessionRevokeSchema = z.object({
  reason: z.string().max(300).optional(),
});

export type SessionRevokeInput = z.infer<typeof sessionRevokeSchema>;