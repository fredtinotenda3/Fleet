import { z } from 'zod';

const currentYear = new Date().getFullYear();

const vehicleStatusSchema = z.enum(['active', 'inactive', 'maintenance']);

export const vehicleSchema = z.object({
  license_plate: z
    .string()
    .min(1, 'License plate is required')
    .max(20, 'License plate must be at most 20 characters')
    .transform((val) => val.toUpperCase().replace(/\s/g, '')),
  make: z.string().min(1, 'Make is required').max(50),
  model: z.string().min(1, 'Model is required').max(50),
  year: z
    .number({ invalid_type_error: 'Year must be a number' })
    .int('Year must be an integer')
    .min(1900, 'Year must be 1900 or later')
    .max(currentYear + 2, `Year cannot exceed ${currentYear + 2}`),
  vehicle_type: z.string().min(1, 'Vehicle type is required'),
  purchase_date: z
    .string()
    .min(1, 'Purchase date is required')
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)'),
  fuel_type: z.string().min(1, 'Fuel type is required'),
  color: z.string().optional().nullable().default('#3b82f6'),
  vin: z.string().optional().nullable(),
  status: vehicleStatusSchema.default('active'),
  registration_expiry: z.string().optional().nullable(),
  insurance_provider: z.string().optional().nullable(),
  service_interval: z.number().positive().optional().nullable(),
  odometer: z.number().nonnegative().optional().nullable(),
});

export const vehicleCreateSchema = vehicleSchema;

export const vehicleUpdateSchema = vehicleSchema.partial().extend({
  _id: z.string().min(1, 'Vehicle ID is required'),
});

export const vehicleFiltersSchema = z.object({
  license_plate: z.string().optional(),
  make: z.string().optional(),
  model: z.string().optional(),
  status: vehicleStatusSchema.optional(),
  year: z.number().int().min(1900).optional(),
  vehicle_type: z.string().optional(),
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(10),
  sortBy: z.string().default('license_plate'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

export type VehicleInput = z.infer<typeof vehicleSchema>;
export type VehicleCreateInput = z.infer<typeof vehicleCreateSchema>;
export type VehicleUpdateInput = z.infer<typeof vehicleUpdateSchema>;
export type VehicleFiltersInput = z.infer<typeof vehicleFiltersSchema>;