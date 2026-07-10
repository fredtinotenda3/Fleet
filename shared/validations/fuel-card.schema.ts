// shared/validations/fuel-card.schema.ts

import { z } from 'zod';

export const fuelCardSchema = z.object({
  card_last4: z.string().regex(/^\d{4}$/, 'Enter the last 4 digits only'),
  provider: z.string().min(1, 'Provider is required').max(100),
  currency: z.string().max(3).optional().default('USD'),
  license_plate: z.string().max(20).optional().nullable(),
  unit_id: z.string().optional().nullable(),
  monthly_limit: z.number().nonnegative().optional().nullable(),
  status: z.enum(['active', 'suspended', 'expired']).default('active'),
  expiry_date: z.union([z.date(), z.string()]).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

export const fuelCardCreateSchema = fuelCardSchema;

export const fuelCardUpdateSchema = fuelCardSchema.partial().extend({
  _id: z.string().min(1, 'Fuel card ID is required'),
});

export type FuelCardInput = z.infer<typeof fuelCardSchema>;