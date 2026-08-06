// shared/validations/organization.schema.ts

import { z } from 'zod';
import {
  Role,
  ORGANIZATION_ROLES,
  ASSIGNABLE_ORGANIZATION_ROLES,
} from '@/server/permissions/roles';

/**
 * PHASE A (enterprise role/scope foundation): these two used to be
 * separately hardcoded `z.enum([...])` arrays here (one per schema,
 * three total across this file) that had to be updated by hand every
 * time a role was added -- and had already drifted out of sync with
 * server/permissions/roles.ts before this fix (neither included
 * BRANCH_MANAGER/DEPARTMENT_MANAGER/WORKSHOP_MANAGER/SUPERVISOR/
 * ORGANIZATION_ADMIN). Both are now derived from the single source of
 * truth in roles.ts.
 */
const organizationRoleEnum = z.enum(ORGANIZATION_ROLES as [Role, ...Role[]]);
const assignableRoleEnum = z.enum(ASSIGNABLE_ORGANIZATION_ROLES as [Role, ...Role[]]);

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
  role: organizationRoleEnum,
  /** Optional branch/org unit the invitee is scoped to once they accept. */
  orgUnitId: z.string().optional(),
});

export const organizationMemberRoleUpdateSchema = z.object({
  role: assignableRoleEnum,
});

/**
 * Direct member creation ("Add member" as opposed to "Invite member").
 * Creates a real login-capable account immediately instead of a pending
 * email invitation. `password` is optional — if omitted, the server
 * generates a temporary one and returns it exactly once in the response.
 */
export const addMemberDirectSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
  email: z.string().email('Invalid email address'),
  role: assignableRoleEnum,
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password too long')
    .optional(),
  /** Branch/org unit to scope this member's access to. Optional. */
  orgUnitId: z.string().optional(),
});

export type OrganizationCreateInput = z.infer<typeof organizationCreateSchema>;
export type OrganizationUpdateInput = z.infer<typeof organizationUpdateSchema>;
export type OrganizationInviteInput = z.infer<typeof organizationInviteSchema>;
export type AddMemberDirectInput = z.infer<typeof addMemberDirectSchema>;