// frontend/modules/trips/schemas/index.ts

import { z } from 'zod';

export const tripModeEnum = z.enum(['distance', 'odometer']);

export const tripFormSchema = z
  .object({
    license_plate: z.string().min(1, 'License plate is required').max(20, 'License plate is too long'),
    date: z.string().min(1, 'Date is required'),
    unit_id: z.string().min(1, 'Distance unit is required'),
    mode: tripModeEnum,
    trip_distance: z.number().positive('Must be greater than 0').optional(),
    start_odometer: z.number().nonnegative('Cannot be negative').optional(),
    end_odometer: z.number().nonnegative('Cannot be negative').optional(),
    notes: z.string().max(500).optional().or(z.literal('')),
    start_location: z.string().max(200).optional().or(z.literal('')),
    end_location: z.string().max(200).optional().or(z.literal('')),
    driver_id: z.string().optional().or(z.literal('')),
  })
  .superRefine((data, ctx) => {
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

export type TripFormValues = z.input<typeof tripFormSchema>;
export type TripFormOutput = z.output<typeof tripFormSchema>;