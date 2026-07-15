// frontend/modules/fuel/schemas/index.ts

import { z } from 'zod';

const fuelFormBaseSchema = z.object({
  license_plate: z.string().min(1, 'License plate is required'),
  unit_id: z.string().min(1, 'Volume unit is required'),
  date: z.date({ message: 'Date is required' }),
  fuel_volume: z.number().positive('Volume must be positive'),
  cost: z.number().positive('Cost must be positive'),
  currency: z.string().min(1, 'Currency is required'),
  odometer: z.number().nonnegative('Odometer must be non-negative').optional(),
  is_full_tank: z.boolean().default(false),
  station_name: z.string().max(100).optional(),
  fuel_station_id: z.string().optional(),
  fuel_type: z.string().optional(),
  notes: z.string().max(500, 'Notes too long').optional(),
  receipt_url: z.union([z.string().url('Enter a valid URL'), z.literal('')]).optional(),
  payment_method: z
    .enum(['cash', 'fuel_card', 'credit_card', 'company_account', 'other'])
    .default('cash'),
  fuel_card_id: z.string().optional(),
  // NEW: optional -- a fuel entry does not require a driver, and every
  // existing record without one continues to work unchanged.
  driver_id: z.string().optional(),
});

export const fuelFormSchema = fuelFormBaseSchema.refine(
  (data) => data.payment_method !== 'fuel_card' || Boolean(data.fuel_card_id),
  { message: 'Select the fuel card used for this purchase', path: ['fuel_card_id'] }
);

export type FuelFormValues = z.infer<typeof fuelFormSchema>;
export type FuelFormOutput = z.output<typeof fuelFormSchema>;