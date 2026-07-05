// shared/validations/billing.schema.ts

import { z } from 'zod';

export const upgradeRequestSchema = z.object({
  organizationId: z.string().min(1),
  planId: z.enum(['professional', 'enterprise']),
  payerEmail: z.string().email('A valid email is required for Paynow checkout'),
});

export const mobileUpgradeRequestSchema = z.object({
  organizationId: z.string().min(1),
  planId: z.enum(['professional', 'enterprise']),
  payerEmail: z.string().email(),
  phoneNumber: z
    .string()
    .regex(/^0(77|78|71)\d{7}$/, 'Enter a valid Econet (077/078) or Netone (071) number'),
  method: z.enum(['ecocash', 'onemoney']),
});

export type UpgradeRequestInput = z.infer<typeof upgradeRequestSchema>;
export type MobileUpgradeRequestInput = z.infer<typeof mobileUpgradeRequestSchema>;