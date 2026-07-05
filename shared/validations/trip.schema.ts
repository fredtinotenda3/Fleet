// shared/validations/trip.schema.ts

import { z } from 'zod';

const modeSchema = z.enum(['distance', 'odometer']);

export const tripBaseSchema = z.object({
  license_plate: z
    .string()
    .min(1, 'License plate is required')
    .transform((val) => val.toUpperCase()),
  date: z
    .union([z.date(), z.string().min(1, 'Date is required')])
    .transform((val) => new Date(val)),
  unit_id: z.string().min(1, 'Unit is required'),
  notes: z.string().max(500).optional().nullable(),
  start_location: z.string().max(200).optional().nullable(),
  end_location: z.string().max(200).optional().nullable(),
  driver_id: z.string().optional().nullable(),
  mode: modeSchema,
  trip_distance: z.number().positive().optional().nullable(),
  start_odometer: z.number().nonnegative().optional().nullable(),
  end_odometer: z.number().nonnegative().optional().nullable(),
});

export const tripCreateSchema = tripBaseSchema.superRefine((data, ctx) => {
  if (data.mode === 'distance') {
    if (!data.trip_distance || data.trip_distance <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Trip distance is required and must be positive for distance mode',
        path: ['trip_distance'],
      });
    }
  }
  if (data.mode === 'odometer') {
    if (data.start_odometer == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Start odometer is required for odometer mode',
        path: ['start_odometer'],
      });
    }
    if (data.end_odometer == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'End odometer is required for odometer mode',
        path: ['end_odometer'],
      });
    }
    if (
      data.start_odometer != null &&
      data.end_odometer != null &&
      data.end_odometer < data.start_odometer
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'End odometer cannot be less than start odometer',
        path: ['end_odometer'],
      });
    }
  }
});

export const tripUpdateSchema = tripBaseSchema.partial().extend({
  _id: z.string().min(1, 'Trip ID is required'),
});

export const tripFiltersSchema = z.object({
  license_plate: z.string().optional(),
  mode: modeSchema.optional(),
  startDate: z.date().optional(),
  endDate: z.date().optional(),
  driver_id: z.string().optional(),
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(50),
});

export type TripCreateInput = z.infer<typeof tripBaseSchema>;
export type TripUpdateInput = z.infer<typeof tripUpdateSchema>;