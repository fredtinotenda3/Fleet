// frontend/modules/organizations/types/roles.types.ts

export type CustomRoleScopeType = 'organization' | 'branch' | 'department' | 'fleet';
export type CustomRoleStatus = 'active' | 'inactive';

export interface CustomRole {
  _id: string;
  organizationId: string;
  name: string;
  description?: string;
  baseRole?: string;
  permissions: string[];
  customPermissionKeys: string[];
  scopeType: CustomRoleScopeType;
  isSystem: boolean;
  status: CustomRoleStatus;
  version: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface CustomRoleCreatePayload {
  name: string;
  description?: string;
  baseRole?: string;
  permissions?: string[];
  customPermissionKeys?: string[];
  scopeType?: CustomRoleScopeType;
}

export interface CustomRoleUpdatePayload {
  name?: string;
  description?: string;
  baseRole?: string | null;
  permissions?: string[];
  customPermissionKeys?: string[];
  scopeType?: CustomRoleScopeType;
  status?: CustomRoleStatus;
}

export interface PermissionDefinition {
  key: string;
  label: string;
  category: string;
  description?: string;
  requiresResourceScope: boolean;
  isCustom: boolean;
}

export interface UserScopeAssignment {
  _id: string;
  organizationId: string;
  userId: string;
  orgUnitId: string;
  role: string;
  isCustomRole: boolean;
  assignedBy?: string;
  createdAt?: string;
}

export interface UserScopeAssignmentCreatePayload {
  userId: string;
  orgUnitId: string;
  role: string;
  isCustomRole?: boolean;
}

/**
 * The built-in static roles, mirrored from server/permissions/roles.ts
 * (Role enum). FIX (Phase E, task 7): this had drifted the same way
 * ORGANIZATION_ROLES in ./index.ts had -- missing every Phase A role.
 * Kept in sync by hand with that list rather than re-declared
 * independently, since RoleList.tsx (BuiltInRolesCard) renders
 * STATIC_ROLES directly and needs to show the same five roles that
 * were invisible here before this fix.
 */
export const STATIC_ROLES = [
  'organization_owner',
  'organization_admin',
  'branch_manager',
  'department_manager',
  'fleet_manager',
  'workshop_manager',
  'supervisor',
  'accountant',
  'dispatcher',
  'driver',
  'mechanic',
  'auditor',
  'viewer',
] as const;
export type StaticRole = (typeof STATIC_ROLES)[number];