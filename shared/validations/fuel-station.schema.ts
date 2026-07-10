// shared/validations/fuel-station.schema.ts

import { z } from 'zod';

export const fuelStationSchema = z.object({
  name: z.string().min(1, 'Station name is required').max(150),
  brand: z.string().max(100).optional().nullable(),
  address: z.string().max(200).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  country: z.string().max(100).optional().nullable(),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  isActive: z.boolean().optional(),
});

export const fuelStationCreateSchema = fuelStationSchema;

export const fuelStationUpdateSchema = fuelStationSchema.partial().extend({
  _id: z.string().min(1, 'Fuel station ID is required'),
});

export type FuelStationInput = z.infer<typeof fuelStationSchema>;