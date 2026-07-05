// shared/validations/webhook.schema.ts

import { z } from 'zod';

export const webhookSubscriptionCreateSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  url: z.string().url('Must be a valid URL'),
  events: z.array(z.string()).min(1, 'At least one event must be selected').max(50),
  description: z.string().max(500).optional(),
});

export const webhookSubscriptionUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  url: z.string().url().optional(),
  events: z.array(z.string()).min(1).max(50).optional(),
  description: z.string().max(500).optional(),
  status: z.enum(['active', 'disabled']).optional(),
});

export type WebhookSubscriptionCreateInput = z.infer<typeof webhookSubscriptionCreateSchema>;
export type WebhookSubscriptionUpdateInput = z.infer<typeof webhookSubscriptionUpdateSchema>;