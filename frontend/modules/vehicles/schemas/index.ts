// frontend/modules/vehicles/schemas/index.ts

import { z } from 'zod';

const currentYear = new Date().getFullYear();

export const vehicleStatusEnum = z.enum(['active', 'inactive', 'maintenance']);

export const vehicleFormSchema = z.object({
  license_plate: z
    .string()
    .min(1, 'License plate is required')
    .max(20, 'License plate must be at most 20 characters'),
  make: z.string().min(1, 'Make is required').max(50, 'Make is too long'),
  model: z.string().min(1, 'Model is required').max(50, 'Model is too long'),
  year: z
    .number({ message: 'Year must be a number' })
    .int('Year must be a whole number')
    .min(1900, 'Year must be 1900 or later')
    .max(currentYear + 2, `Year cannot exceed ${currentYear + 2}`),
  vehicle_type: z.string().min(1, 'Vehicle type is required'),
  purchase_date: z
    .string()
    .min(1, 'Purchase date is required')
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use format YYYY-MM-DD'),
  fuel_type: z.string().min(1, 'Fuel type is required'),
  color: z.string().optional(),
  vin: z.string().max(17, 'VIN must be at most 17 characters').optional().or(z.literal('')),
  status: vehicleStatusEnum.default('active'),
  registration_expiry: z.string().optional().or(z.literal('')),
  insurance_provider: z.string().max(100).optional().or(z.literal('')),
  service_interval: z.number().positive('Must be greater than 0').optional(),
  odometer: z.number().nonnegative('Cannot be negative').optional(),
});

// Use z.input to get the form input type (before transforms/defaults)
export type VehicleFormValues = z.input<typeof vehicleFormSchema>;

// Use z.output if you need the type after transforms/defaults are applied
export type VehicleFormOutput = z.output<typeof vehicleFormSchema>;