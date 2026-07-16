// shared/validations/fuel.schema.ts

import { z } from 'zod';

const fuelLogBaseSchema = z.object({
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
  unit_id: z.string().optional(),
  cost: z
    .number({ error: 'Cost must be a number' })
    .nonnegative('Cost cannot be negative')
    .max(999_999.99, 'Cost exceeds maximum'),
  odometer: z.number().nonnegative('Odometer cannot be negative').optional().nullable(),
  station_name: z.string().max(100).optional().nullable(),
  fuel_station_id: z.string().optional().nullable(),
  fuel_type: z.string().max(30).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  currency: z.string().max(3).optional().nullable(),
  is_full_tank: z.boolean().optional().nullable(),
  receipt_url: z.string().url('Invalid receipt URL').max(500).optional().nullable(),
  payment_method: z
    .enum(['cash', 'fuel_card', 'credit_card', 'company_account', 'other'])
    .default('cash'),
  fuel_card_id: z.string().optional().nullable(),
});

export const fuelLogCreateSchema = fuelLogBaseSchema.refine(
  (data) => data.payment_method !== 'fuel_card' || Boolean(data.fuel_card_id),
  { message: 'Select a fuel card for card payments', path: ['fuel_card_id'] }
);

export const fuelLogUpdateSchema = fuelLogBaseSchema.partial().extend({
  _id: z.string().min(1, 'Fuel log ID is required'),
});

export const fuelFiltersSchema = z.object({
  license_plate: z.string().optional(),
  unit_id: z.string().optional(),
  startDate: z.date().optional(),
  endDate: z.date().optional(),
  payment_method: z.enum(['cash', 'fuel_card', 'credit_card', 'company_account', 'other']).optional(),
  fuel_station_id: z.string().optional(),
  fuel_card_id: z.string().optional(),
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(50),
});

export type FuelLogInput = z.infer<typeof fuelLogBaseSchema>;
export type FuelLogCreateInput = z.infer<typeof fuelLogCreateSchema>;