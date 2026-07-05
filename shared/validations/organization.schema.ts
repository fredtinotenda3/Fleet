// shared/validations/organization.schema.ts

import { z } from 'zod';

export const organizationCreateSchema = z.object({
  name: z.string().min(1, 'Organization name is required').max(100, 'Name too long'),
  ownerEmail: z.string().email('Invalid email address'),
  ownerName: z.string().min(1, 'Owner name is required').max(100),
  settings: z
    .object({
      timezone: z.string().optional(),
      dateFormat: z.string().optional(),
      currency: z.string().optional(),
      distanceUnit: z.enum(['km', 'mi']).optional(),
      volumeUnit: z.enum(['L', 'gal']).optional(),
      language: z.string().optional(),
      notificationsEnabled: z.boolean().optional(),
      emailReports: z.boolean().optional(),
    })
    .partial()
    .optional(),
});

export const organizationUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  branding: z
    .object({
      primaryColor: z.string().optional(),
      logoUrl: z.string().url().optional().nullable(),
      faviconUrl: z.string().url().optional().nullable(),
      companyName: z.string().optional(),
      theme: z.enum(['light', 'dark', 'system']).optional(),
    })
    .partial()
    .optional(),
  settings: z
    .object({
      timezone: z.string().optional(),
      dateFormat: z.string().optional(),
      currency: z.string().optional(),
      distanceUnit: z.enum(['km', 'mi']).optional(),
      volumeUnit: z.enum(['L', 'gal']).optional(),
      language: z.string().optional(),
      notificationsEnabled: z.boolean().optional(),
      emailReports: z.boolean().optional(),
    })
    .partial()
    .optional(),
});

export const organizationInviteSchema = z.object({
  email: z.string().email('Invalid email address'),
  role: z.enum([
    'organization_owner',
    'fleet_manager',
    'accountant',
    'dispatcher',
    'driver',
    'mechanic',
    'auditor',
    'viewer',
  ]),
});

export const organizationMemberRoleUpdateSchema = z.object({
  role: z.enum([
    'fleet_manager',
    'accountant',
    'dispatcher',
    'driver',
    'mechanic',
    'auditor',
    'viewer',
  ]),
});

export type OrganizationCreateInput = z.infer<typeof organizationCreateSchema>;
export type OrganizationUpdateInput = z.infer<typeof organizationUpdateSchema>;
export type OrganizationInviteInput = z.infer<typeof organizationInviteSchema>;