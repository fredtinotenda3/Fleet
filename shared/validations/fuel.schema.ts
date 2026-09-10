// shared/validations/fuel.schema.ts

import { z } from 'zod';
import { partialForUpdate } from './update-schema.utils';

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
  /**
   * THE "FUEL COST BY DRIVER SHOWS UNASSIGNED" BUG.
   *
   * This field was missing from the schema entirely. Every layer above
   * it was correct and every layer below it was correct:
   *
   *   - FuelForm sends driver_id.
   *   - The spreadsheet importer resolves a driver NAME to an id,
   *     including an ambiguity refusal, and sets driver_id.
   *   - CreateFuelLogHandler copies raw.driver_id into its payload.
   *   - UpdateFuelLogHandler lists 'driver_id' in UPDATABLE_FIELDS,
   *     added by an earlier fix for exactly this symptom.
   *   - getFuelByDriver groups on driver_id and joins tbldrivers.
   *
   * In between, `fuelLogBaseSchema` is a plain z.object, which STRIPS
   * unknown keys. So validation deleted the value on the way past, on
   * both create and update, and the handler then read it back through
   * `(validated as Record<string, unknown>).driver_id` -- a cast that
   * made the always-`undefined` result type-check. No fuel log has ever
   * carried a driver, so every one of them landed in the single null
   * bucket the chart renders as "Unassigned".
   *
   * This is the third instance of the same class in this codebase
   * (drivers' orgUnitId was the first two): a value the caller computed,
   * dropped by a z.object strip, cast around so it compiles.
   * tests/security/write-payload-schema-conformance.spec.ts now fails
   * whenever a handler feeds a key its schema would strip.
   *
   * Nullable so a driver can be CLEARED on update. `.optional()` alone
   * cannot express "remove this", because the update handler skips
   * absent keys -- which is why an incorrectly attributed log could
   * never have its driver removed.
   */
  driver_id: z.string().optional().nullable(),
  tripId: z.string().optional().nullable(),
});

export const fuelLogCreateSchema = fuelLogBaseSchema.refine(
  (data) => data.payment_method !== 'fuel_card' || Boolean(data.fuel_card_id),
  { message: 'Select a fuel card for card payments', path: ['fuel_card_id'] }
);

export const fuelLogUpdateSchema = partialForUpdate(fuelLogBaseSchema).extend({
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
  // Mirrors FuelFilters, which the controller builds by hand. Kept in
  // step deliberately: a filters schema that silently lacks a field the
  // controller filters on is the same drift that hid the driver_id bug.
  driver_id: z.string().optional(),
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(50),
});

export type FuelLogInput = z.infer<typeof fuelLogBaseSchema>;
export type FuelLogCreateInput = z.infer<typeof fuelLogCreateSchema>;