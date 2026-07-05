// shared/validations/auth-token.schema.ts

import { z } from 'zod';

export const tokenLoginSchema = z.object({
  email: z.string().email('Valid email is required'),
  password: z.string().min(1, 'Password is required'),
  deviceLabel: z.string().max(100).optional(),
  code: z.string().regex(/^\d{6}$/).optional(),
  backupCode: z.string().regex(/^[A-Z0-9]{5}-[A-Z0-9]{5}$/i).optional(),
});

export const tokenRefreshSchema = z.object({
  refreshToken: z.string().min(1, 'refreshToken is required'),
  tenantId: z.string().optional(),
});

export const tokenRevokeSchema = z.object({
  refreshToken: z.string().min(1, 'refreshToken is required'),
  tenantId: z.string().optional(),
});

export type TokenLoginInput = z.infer<typeof tokenLoginSchema>;
export type TokenRefreshInput = z.infer<typeof tokenRefreshSchema>;
export type TokenRevokeInput = z.infer<typeof tokenRevokeSchema>;