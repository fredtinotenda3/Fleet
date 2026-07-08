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

/** The built-in static roles, mirrored from server/permissions/roles.ts (Role enum). */
export const STATIC_ROLES = [
  'organization_owner',
  'fleet_manager',
  'accountant',
  'dispatcher',
  'driver',
  'mechanic',
  'auditor',
  'viewer',
] as const;
export type StaticRole = (typeof STATIC_ROLES)[number];