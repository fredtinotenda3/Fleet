// shared/validations/trip.schema.ts

import { z } from 'zod';
import { TRIP_STATUSES, TRIP_TYPES } from '@/shared/types/trip.types';

const modeSchema = z.enum(['distance', 'odometer']);
const statusSchema = z.enum(TRIP_STATUSES as [string, ...string[]]);
const tripTypeSchema = z.enum(TRIP_TYPES as [string, ...string[]]);

/**
 * PHASE 1: configurable tolerance for the trip_distance vs.
 * (end_odometer - start_odometer) cross-check requested in the brief.
 * Both fields are still only required per-mode (unchanged from
 * before), but when BOTH happen to be present -- e.g. a bulk import
 * row that supplies odometer readings while the trip is nominally in
 * "distance" mode -- we now verify they roughly agree instead of
 * silently trusting whichever one the mode picked. Expressed as a
 * percentage of the odometer-derived distance so it scales sensibly
 * for both short in-town trips and long-haul runs.
 */
export const TRIP_DISTANCE_TOLERANCE_PCT = 0.1; // 10%
export const TRIP_DISTANCE_TOLERANCE_MIN_KM = 2; // floor, for very short trips

const modeSchemaEnum = modeSchema;

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
  mode: modeSchemaEnum,
  trip_distance: z.number().positive().optional().nullable(),
  start_odometer: z.number().nonnegative().optional().nullable(),
  end_odometer: z.number().nonnegative().optional().nullable(),

  // --- PHASE 1 additions ---
  status: statusSchema.optional().nullable(),
  start_time: z.union([z.date(), z.string()]).optional().nullable(),
  end_time: z.union([z.date(), z.string()]).optional().nullable(),
  trip_type: tripTypeSchema.optional().nullable(),
  routeId: z.string().optional().nullable(),
});

function applySharedRefinements(data: z.infer<typeof tripBaseSchema>, ctx: z.RefinementCtx) {
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

  // Cross-check: when both a declared trip_distance AND an odometer
  // pair are present (regardless of mode), they must roughly agree.
  if (
    data.trip_distance != null &&
    data.start_odometer != null &&
    data.end_odometer != null &&
    data.end_odometer >= data.start_odometer
  ) {
    const odometerDistance = data.end_odometer - data.start_odometer;
    const tolerance = Math.max(
      TRIP_DISTANCE_TOLERANCE_MIN_KM,
      odometerDistance * TRIP_DISTANCE_TOLERANCE_PCT
    );
    if (Math.abs(data.trip_distance - odometerDistance) > tolerance) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Declared trip distance (${data.trip_distance}) does not match odometer-derived distance (${odometerDistance}) within tolerance (\u00B1${tolerance.toFixed(1)})`,
        path: ['trip_distance'],
      });
    }
  }

  // Time ordering, when both provided.
  if (data.start_time && data.end_time) {
    const start = new Date(data.start_time as string);
    const end = new Date(data.end_time as string);
    if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && end < start) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'End time cannot be before start time',
        path: ['end_time'],
      });
    }
  }
}

export const tripCreateSchema = tripBaseSchema.superRefine(applySharedRefinements);

export const tripUpdateSchema = tripBaseSchema.partial().extend({
  _id: z.string().min(1, 'Trip ID is required'),
});

export const tripFiltersSchema = z.object({
  license_plate: z.string().optional(),
  mode: modeSchema.optional(),
  startDate: z.date().optional(),
  endDate: z.date().optional(),
  driver_id: z.string().optional(),
  status: statusSchema.optional(),
  trip_type: tripTypeSchema.optional(),
  routeId: z.string().optional(),
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(50),
});

export type TripCreateInput = z.infer<typeof tripBaseSchema>;
export type TripUpdateInput = z.infer<typeof tripUpdateSchema>;
