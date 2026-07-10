// frontend/modules/fuel-stations/schemas/index.ts

import { z } from 'zod';

export const fuelStationFormSchema = z.object({
  name: z.string().min(1, 'Station name is required'),
  brand: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  phone: z.string().optional(),
  notes: z.string().optional(),
  isActive: z.boolean(),
});

export type FuelStationFormValues = z.infer<typeof fuelStationFormSchema>;