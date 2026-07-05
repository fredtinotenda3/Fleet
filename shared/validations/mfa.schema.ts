// shared/validations/mfa.schema.ts

import { z } from 'zod';

export const mfaEnrollVerifySchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Code must be 6 digits'),
});

export const mfaCodeSchema = z
  .object({
    code: z.string().regex(/^\d{6}$/).optional(),
    backupCode: z.string().regex(/^[A-Z0-9]{5}-[A-Z0-9]{5}$/i).optional(),
  })
  .refine((data) => !!data.code || !!data.backupCode, {
    message: 'Either code or backupCode is required',
  });

export type MfaEnrollVerifyInput = z.infer<typeof mfaEnrollVerifySchema>;
export type MfaCodeInput = z.infer<typeof mfaCodeSchema>;