// shared/validations/organization.settings-addendum.schema.ts

import { z } from 'zod';

export const contactDetailsUpdateSchema = z.object({
  contactEmail: z.string().email(),
  contactPhone: z.string().max(20).optional(),
  addressLine1: z.string().min(1).max(200),
  addressLine2: z.string().max(200).optional(),
  city: z.string().min(1).max(100),
  state: z.string().max(100).optional(),
  postalCode: z.string().max(20).optional(),
  country: z.string().min(1).max(100),
});

const businessHoursDaySchema = z.object({
  enabled: z.boolean(),
  openTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
  closeTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
});

export const businessHoursUpdateSchema = z.object({
  monday: businessHoursDaySchema,
  tuesday: businessHoursDaySchema,
  wednesday: businessHoursDaySchema,
  thursday: businessHoursDaySchema,
  friday: businessHoursDaySchema,
  saturday: businessHoursDaySchema,
  sunday: businessHoursDaySchema,
});

export const taxSettingsUpdateSchema = z.object({
  taxId: z.string().max(50).optional(),
  taxRate: z.number().min(0).max(100),
  taxInclusivePricing: z.boolean(),
});

export type ContactDetailsUpdateInput = z.infer<typeof contactDetailsUpdateSchema>;
export type BusinessHoursUpdateInput = z.infer<typeof businessHoursUpdateSchema>;
export type TaxSettingsUpdateInput = z.infer<typeof taxSettingsUpdateSchema>;