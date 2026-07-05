// shared/validations/security.schema.ts

import { z } from 'zod';
import { Permission, Role } from '@/server/permissions/roles';

const abacConditionSchema = z.object({
  attribute: z.string().min(1),
  operator: z.enum([
    'eq',
    'neq',
    'gt',
    'gte',
    'lt',
    'lte',
    'in',
    'not_in',
    'contains',
    'not_contains',
    'exists',
    'not_exists',
  ]),
  value: z.unknown().optional(),
});

export const customRoleCreateSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional(),
  baseRole: z.nativeEnum(Role).optional(),
  permissions: z.array(z.nativeEnum(Permission)).default([]),
  customPermissionKeys: z.array(z.string()).default([]),
  scopeType: z.enum(['organization', 'branch', 'department', 'fleet']).default('organization'),
});

export const customRoleUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  baseRole: z.nativeEnum(Role).nullable().optional(),
  permissions: z.array(z.nativeEnum(Permission)).optional(),
  customPermissionKeys: z.array(z.string()).optional(),
  scopeType: z.enum(['organization', 'branch', 'department', 'fleet']).optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

export const orgUnitCreateSchema = z.object({
  type: z.enum(['branch', 'department', 'fleet', 'workshop', 'team']),
  name: z.string().min(1, 'Name is required').max(100),
  code: z.string().max(30).optional(),
  parentId: z.string().nullable().optional(),
  managerId: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const orgUnitUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  code: z.string().max(30).optional(),
  managerId: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

export const resourcePermissionCreateSchema = z.object({
  subjectType: z.enum(['user', 'role', 'customRole']),
  subjectId: z.string().min(1, 'subjectId is required'),
  permission: z.string().min(1, 'permission is required'),
  effect: z.enum(['allow', 'deny']),
  resourceType: z.string().optional(),
  resourceId: z.string().optional(),
  orgUnitId: z.string().optional(),
  conditions: z.array(abacConditionSchema).optional(),
  expiresAt: z.union([z.string(), z.date()]).nullable().optional(),
  reason: z.string().max(500).optional(),
});

export const userScopeAssignmentCreateSchema = z.object({
  userId: z.string().min(1, 'userId is required'),
  orgUnitId: z.string().min(1, 'orgUnitId is required'),
  role: z.string().min(1, 'role is required'),
  isCustomRole: z.boolean().default(false),
});

export const permissionCheckRequestSchema = z.object({
  permission: z.string().min(1),
  resource: z
    .object({
      type: z.string(),
      id: z.string().optional(),
      orgUnitId: z.string().optional(),
      attributes: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
});

export type CustomRoleCreateInput = z.infer<typeof customRoleCreateSchema>;
export type CustomRoleUpdateInput = z.infer<typeof customRoleUpdateSchema>;
export type OrgUnitCreateInput = z.infer<typeof orgUnitCreateSchema>;
export type OrgUnitUpdateInput = z.infer<typeof orgUnitUpdateSchema>;
export type ResourcePermissionCreateInput = z.infer<typeof resourcePermissionCreateSchema>;
export type UserScopeAssignmentCreateInput = z.infer<typeof userScopeAssignmentCreateSchema>;
export type PermissionCheckRequestInput = z.infer<typeof permissionCheckRequestSchema>;