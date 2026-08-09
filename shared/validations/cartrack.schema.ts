// shared/validations/cartrack.schema.ts

import { z } from 'zod';

export const cartrackConfigSchema = z.object({
  enabled: z.boolean(),
  accountId: z.string().min(1, 'Account ID is required'),
  apiKey: z.string().min(1, 'API key is required'),
  apiSecret: z.string().min(1, 'API secret is required'),
  baseUrl: z
    .string()
    .url('Must be a valid URL')
    .default('https://fleetapi.cartrack.com'),
});

export type CartrackConfigInputSchema = z.infer<typeof cartrackConfigSchema>;