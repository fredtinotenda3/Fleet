// shared/validations/fuel.schema.ts

import { z } from 'zod';

export const fuelLogSchema = z.object({
  license_plate: z
    .string()
    .min(1, 'License plate is required')
    .transform((val) => val.toUpperCase()),
  date: z
    .union([z.date(), z.string().min(1, 'Date is required')])
    .transform((val) => new Date(val)),
  fuel_volume: z
    .number({ error: 'Fuel volume must be a number' })
    .positive('Fuel volume must be positive')
    .max(10_000, 'Fuel volume exceeds maximum'),
  unit_id: z.string().min(1, 'Unit is required'),
  cost: z
    .number({ error: 'Cost must be a number' })
    .nonnegative('Cost cannot be negative')
    .max(999_999.99, 'Cost exceeds maximum'),
  odometer: z
    .number()
    .nonnegative('Odometer cannot be negative')
    .optional()
    .nullable(),
  station_name: z.string().max(100).optional().nullable(),
  fuel_type: z.string().max(30).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

export const fuelLogCreateSchema = fuelLogSchema;

export const fuelLogUpdateSchema = fuelLogSchema.partial().extend({
  _id: z.string().min(1, 'Fuel log ID is required'),
});

export const fuelFiltersSchema = z.object({
  license_plate: z.string().optional(),
  unit_id: z.string().optional(),
  startDate: z.date().optional(),
  endDate: z.date().optional(),
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(50),
});

export type FuelLogInput = z.infer<typeof fuelLogSchema>;
export type FuelLogCreateInput = z.infer<typeof fuelLogCreateSchema>;