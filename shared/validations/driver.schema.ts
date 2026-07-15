// shared/validations/driver.schema.ts

import { z } from 'zod';

export const driverSchema = z.object({
  name: z.string().min(1, 'Driver name is required').max(150),
  email: z.string().email('Invalid email').max(150).optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  driver_code: z.string().max(30).optional().nullable(),
  license_number: z.string().max(50).optional().nullable(),
  license_expiry: z.union([z.date(), z.string()]).optional().nullable(),
  status: z.enum(['active', 'inactive', 'suspended']).default('active'),
  notes: z.string().max(500).optional().nullable(),
});

export const driverCreateSchema = driverSchema;

export const driverUpdateSchema = driverSchema.partial().extend({
  _id: z.string().min(1, 'Driver ID is required'),
});

export type DriverInput = z.infer<typeof driverSchema>;
