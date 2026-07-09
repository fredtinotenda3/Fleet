// frontend/modules/fuel/schemas/index.ts

import { z } from 'zod';

export const fuelFormSchema = z.object({
  license_plate: z.string().min(1, 'License plate is required'),
  unit_id: z.string().min(1, 'Volume unit is required'),
  date: z.date({ message: 'Date is required' }), // Changed from required_error to message
  fuel_volume: z.number().positive('Volume must be positive'),
  cost: z.number().positive('Cost must be positive'),
  currency: z.string().min(1, 'Currency is required'),
  odometer: z.number().nonnegative('Odometer must be non-negative').optional(),
  is_full_tank: z.boolean(),
  station_name: z.string().max(100).optional(),
  fuel_type: z.string().optional(),
  notes: z.string().max(500, 'Notes too long').optional(),
  receipt_url: z.union([z.string().url('Enter a valid URL'), z.literal('')]).optional(),
});

export type FuelFormValues = z.infer<typeof fuelFormSchema>;
export type FuelFormOutput = z.output<typeof fuelFormSchema>;