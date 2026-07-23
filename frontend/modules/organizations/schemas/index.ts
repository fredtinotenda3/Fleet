// frontend/modules/organizations/schemas/index.ts

import { z } from 'zod';
import { ASSIGNABLE_ROLES, ORGANIZATION_ROLES } from '../types';

export const generalInfoSchema = z.object({
  name: z.string().min(1, 'Organization name is required').max(100, 'Name is too long'),
  companyName: z.string().min(1, 'Company name is required').max(100),
});
export type GeneralInfoFormValues = z.infer<typeof generalInfoSchema>;

export const brandingSchema = z.object({
  primaryColor: z
    .string()
    .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Must be a valid hex color'),
  logoUrl: z.string().url('Must be a valid URL').optional().or(z.literal('')),
  faviconUrl: z.string().url('Must be a valid URL').optional().or(z.literal('')),
  theme: z.enum(['light', 'dark', 'system']),
});
export type BrandingFormValues = z.infer<typeof brandingSchema>;

export const contactDetailsSchema = z.object({
  contactEmail: z.string().email('Invalid email address'),
  contactPhone: z
    .string()
    .min(7, 'Phone number is too short')
    .max(20, 'Phone number is too long')
    .optional()
    .or(z.literal('')),
  addressLine1: z.string().min(1, 'Address is required').max(200),
  addressLine2: z.string().max(200).optional().or(z.literal('')),
  city: z.string().min(1, 'City is required').max(100),
  state: z.string().max(100).optional().or(z.literal('')),
  postalCode: z.string().max(20).optional().or(z.literal('')),
  country: z.string().min(1, 'Country is required').max(100),
});
export type ContactDetailsFormValues = z.infer<typeof contactDetailsSchema>;

export const regionalSettingsSchema = z.object({
  timezone: z.string().min(1, 'Time zone is required'),
  currency: z.string().length(3, 'Use a 3-letter currency code (e.g. USD)'),
  dateFormat: z.enum(['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD']),
  language: z.string().min(2, 'Language is required'),
  distanceUnit: z.enum(['km', 'mi']),
  volumeUnit: z.enum(['L', 'gal']),
});
export type RegionalSettingsFormValues = z.infer<typeof regionalSettingsSchema>;

export const businessHoursDaySchema = z.object({
  enabled: z.boolean(),
  openTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Use HH:MM format'),
  closeTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Use HH:MM format'),
});

export const businessHoursSchema = z.object({
  monday: businessHoursDaySchema,
  tuesday: businessHoursDaySchema,
  wednesday: businessHoursDaySchema,
  thursday: businessHoursDaySchema,
  friday: businessHoursDaySchema,
  saturday: businessHoursDaySchema,
  sunday: businessHoursDaySchema,
});
export type BusinessHoursFormValues = z.infer<typeof businessHoursSchema>;

export const taxSettingsSchema = z.object({
  taxId: z.string().max(50).optional().or(z.literal('')),
  taxRate: z
    .number({ error: 'Tax rate must be a number' })
    .min(0, 'Tax rate cannot be negative')
    .max(100, 'Tax rate cannot exceed 100%'),
  taxInclusivePricing: z.boolean(),
});
export type TaxSettingsFormValues = z.infer<typeof taxSettingsSchema>;

export const notificationPreferencesSchema = z.object({
  notificationsEnabled: z.boolean(),
  emailReports: z.boolean(),
  weeklyDigest: z.boolean(),
  criticalAlertsOnly: z.boolean(),
});
export type NotificationPreferencesFormValues = z.infer<typeof notificationPreferencesSchema>;

export const securitySettingsSchema = z.object({
  requireMfa: z.boolean(),
  sessionTimeoutMinutes: z
    .number({ error: 'Must be a number' })
    .int()
    .min(5, 'Minimum 5 minutes')
    .max(1440, 'Maximum 24 hours'),
  passwordMinLength: z.number().int().min(8, 'Minimum 8 characters').max(128),
  passwordRequireSymbol: z.boolean(),
  passwordRequireNumber: z.boolean(),
  passwordExpiryDays: z.number().int().min(0, 'Use 0 to disable expiry').max(365),
});
export type SecuritySettingsFormValues = z.infer<typeof securitySettingsSchema>;

export const inviteMemberSchema = z.object({
  email: z.string().email('Invalid email address'),
  role: z.enum(ASSIGNABLE_ROLES as [string, ...string[]]),
  orgUnitId: z.string().optional().or(z.literal('')),
});
export type InviteMemberFormValues = z.infer<typeof inviteMemberSchema>;

export const addMemberDirectSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
  email: z.string().email('Invalid email address'),
  role: z.enum(ASSIGNABLE_ROLES as [string, ...string[]]),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password too long')
    .optional()
    .or(z.literal('')),
  orgUnitId: z.string().optional().or(z.literal('')),
});
export type AddMemberDirectFormValues = z.infer<typeof addMemberDirectSchema>;

export const editMemberRoleSchema = z.object({
  role: z.enum(ASSIGNABLE_ROLES as [string, ...string[]]),
});
export type EditMemberRoleFormValues = z.infer<typeof editMemberRoleSchema>;

export const createOrganizationSchema = z.object({
  name: z.string().min(1, 'Organization name is required').max(100),
  ownerEmail: z.string().email('Invalid email address'),
  ownerName: z.string().min(1, 'Owner name is required').max(100),
});
export type CreateOrganizationFormValues = z.infer<typeof createOrganizationSchema>;

export const orgUnitFormSchema = z.object({
  type: z.enum(['branch', 'department', 'fleet', 'workshop', 'team']),
  name: z.string().min(1, 'Name is required').max(100),
  code: z.string().max(30).optional().or(z.literal('')),
  parentId: z.string().nullable().optional(),
  managerId: z.string().optional().or(z.literal('')),
});
export type OrgUnitFormValues = z.infer<typeof orgUnitFormSchema>;

export const customRoleSchema = z.object({
  name: z.string().min(1, 'Role name is required').max(50),
  description: z.string().max(250).optional().or(z.literal('')),
  baseRole: z.string().optional().or(z.literal('')),
  scopeType: z.enum(['organization', 'branch', 'department', 'fleet']),
  permissions: z.array(z.string()),
  customPermissionKeys: z.array(z.string()),
});
export type CustomRoleFormValues = z.infer<typeof customRoleSchema>;

export const scopeAssignmentSchema = z.object({
  userId: z.string().min(1, 'A user is required'),
  orgUnitId: z.string().min(1, 'An org unit is required'),
  role: z.string().min(1, 'A role is required'),
  isCustomRole: z.boolean(),
});
export type ScopeAssignmentFormValues = z.infer<typeof scopeAssignmentSchema>;

export const memberSearchFilterSchema = z.object({
  search: z.string().optional(),
  role: z.enum(ORGANIZATION_ROLES as [string, ...string[]]).optional(),
  status: z.enum(['active', 'invited', 'suspended']).optional(),
});
export type MemberSearchFilterValues = z.infer<typeof memberSearchFilterSchema>;