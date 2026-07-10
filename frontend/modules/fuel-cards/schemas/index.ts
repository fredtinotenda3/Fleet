// frontend/modules/fuel-cards/schemas/index.ts

import { z } from 'zod';

export const fuelCardFormSchema = z.object({
  card_last4: z.string().regex(/^\d{4}$/, 'Enter the last 4 digits only'),
  provider: z.string().min(1, 'Provider is required'),
  currency: z.string().min(1, 'Currency is required'),
  license_plate: z.string().optional(),
  monthly_limit: z.number().nonnegative().optional(),
  status: z.enum(['active', 'suspended', 'expired']),
  expiry_date: z.string().optional(),
  notes: z.string().optional(),
});

export type FuelCardFormValues = z.infer<typeof fuelCardFormSchema>;