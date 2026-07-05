// modules/security/types/custom-role.types.ts

import { BaseEntity } from '@/shared/types/common.types';
import { Role, Permission } from '@/server/permissions/roles';

export type CustomRoleStatus = 'active' | 'inactive';
export type CustomRoleScopeType = 'organization' | 'branch' | 'department' | 'fleet';

/**
 * A tenant-defined role beyond the static Role enum. Grants are the union
 * of `permissions` (static Permission enum members) and
 * `customPermissionKeys` (dynamic keys registered in PermissionRegistry
 * that aren't part of the static enum, e.g. "vehicle:transfer").
 * `baseRole` optionally inherits a static role's permission set as a
 * starting point; the Permission Engine treats a custom role's
 * `permissions`/`customPermissionKeys` as additive on top of it.
 */
export interface CustomRole extends BaseEntity {
  organizationId: string;
  name: string;
  description?: string;
  baseRole?: Role;
  permissions: Permission[];
  customPermissionKeys: string[];
  scopeType: CustomRoleScopeType;
  isSystem: boolean;
  status: CustomRoleStatus;
  version: number;
}

export interface CustomRoleCreateDTO {
  organizationId: string;
  name: string;
  description?: string;
  baseRole?: Role;
  permissions?: Permission[];
  customPermissionKeys?: string[];
  scopeType?: CustomRoleScopeType;
}

export interface CustomRoleUpdateDTO {
  name?: string;
  description?: string;
  baseRole?: Role | null;
  permissions?: Permission[];
  customPermissionKeys?: string[];
  scopeType?: CustomRoleScopeType;
  status?: CustomRoleStatus;
}