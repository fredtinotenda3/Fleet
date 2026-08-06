// frontend/modules/drivers/schemas/index.ts

import { z } from 'zod';

export const driverFormSchema = z.object({
  name: z.string().min(1, 'Driver name is required'),
  email: z.union([z.string().email('Enter a valid email'), z.literal('')]).optional(),
  phone: z.string().max(30).optional(),
  driver_code: z.string().max(30).optional(),
  license_number: z.string().max(50).optional(),
  license_expiry: z.string().optional(),
  // NOTE: deliberately NOT `.default('active')`. A zod default makes the
  // schema's input type differ from its output type (status optional in,
  // required out), which makes zodResolver's Resolver<> unassignable to
  // useForm<DriverFormValues>. The form supplies 'active' via its own
  // defaultValues instead, keeping one consistent type.
  status: z.enum(['active', 'inactive', 'suspended']),
  notes: z.string().max(500).optional(),
});

export type DriverFormValues = z.infer<typeof driverFormSchema>;