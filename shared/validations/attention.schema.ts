// shared/validations/attention.schema.ts

import { z } from 'zod';

/**
 * Body for POST /api/ai/needs-attention/:id/resolve.
 *
 * baselineTier and evidenceRefs are optional at the schema level
 * because resolve applies to every source, but attention-resolution.
 * service.ts requires both (via its own check, not this schema) when
 * the item being resolved is fuel_fraud or expense_anomaly -- that's a
 * conditional-on-the-record rule, not something zod can express without
 * knowing the item first, so the second check happens after the item
 * is loaded. See the service for the exact error returned when they're
 * missing on an eligible item.
 */
export const resolveAttentionItemSchema = z.object({
  /** What the resolver confirmed actually happened. Falls back to the item's modelled cost when omitted. */
  realisedAmount: z.number().nonnegative().optional(),
  baselineTier: z.enum(['T1', 'T2', 'T3']).optional(),
  /** References to whatever the resolver checked -- receipt ids, ticket numbers, document refs. */
  evidenceRefs: z.array(z.string().min(1).max(200)).max(20).optional(),
  notes: z.string().max(2000).optional(),
});

export type ResolveAttentionItemInput = z.infer<typeof resolveAttentionItemSchema>;