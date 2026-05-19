// shared/validations/trip.schema.ts

import { z } from 'zod';

const modeSchema = z.enum(['distance', 'odometer']);

export const tripSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('distance'),
    license_plate: z.string().min(1, 'License plate is required'),
    date: z.date().or(z.string().datetime()).transform(val => new Date(val)),
    unit_id: z.string().min(1, 'Unit is required'),
    trip_distance: z.number().positive('Trip distance must be positive'),
    notes: z.string().max(500).optional(),
    start_location: z.string().optional(),
    end_location: z.string().optional(),
    driver_id: z.string().optional(),
  }),
  z.object({
    mode: z.literal('odometer'),
    license_plate: z.string().min(1, 'License plate is required'),
    date: z.date().or(z.string().datetime()).transform(val => new Date(val)),
    unit_id: z.string().min(1, 'Unit is required'),
    start_odometer: z.number().nonnegative('Start odometer cannot be negative'),
    end_odometer: z.number().nonnegative('End odometer cannot be negative'),
    notes: z.string().max(500).optional(),
    start_location: z.string().optional(),
    end_location: z.string().optional(),
    driver_id: z.string().optional(),
  }),
]).refine(data => {
  if (data.mode === 'odometer' && data.end_odometer < data.start_odometer) {
    return false;
  }
  return true;
}, {
  message: 'End odometer cannot be less than start odometer',
  path: ['end_odometer'],
});

export const tripCreateSchema = tripSchema;
export const tripUpdateSchema = tripSchema.partial().extend({
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

export type TripInput = z.infer<typeof tripSchema>;
export type TripCreateInput = z.infer<typeof tripCreateSchema>;