// modules/security/types/resource-permission.types.ts

import { BaseEntity } from '@/shared/types/common.types';
import { AbacCondition } from './abac.types';

export type PermissionEffect = 'allow' | 'deny';
export type PermissionSubjectType = 'user' | 'role' | 'customRole';

/**
 * An explicit, resource-scoped permission grant or denial. `subjectId` is
 * matched against the user's own id, every static role name they hold,
 * and every custom role id assigned to them â€” whichever matches first.
 * Omitting `resourceType`/`resourceId` makes the grant organization-wide
 * for that permission; omitting `orgUnitId` makes it apply regardless of
 * branch/department/fleet. An explicit `deny` always wins over any
 * `allow`, static RBAC membership, or custom-role membership.
 */
export interface ResourcePermission extends BaseEntity {
  organizationId: string;
  subjectType: PermissionSubjectType;
  subjectId: string;
  permission: string;
  effect: PermissionEffect;
  resourceType?: string;
  resourceId?: string;
  orgUnitId?: string;
  conditions?: AbacCondition[];
  expiresAt?: Date | null;
  reason?: string;
  grantedBy?: string;
}

export interface ResourcePermissionCreateDTO {
  organizationId: string;
  subjectType: PermissionSubjectType;
  subjectId: string;
  permission: string;
  effect: PermissionEffect;
  resourceType?: string;
  resourceId?: string;
  orgUnitId?: string;
  conditions?: AbacCondition[];
  expiresAt?: Date | string | null;
  reason?: string;
}

export interface ResourcePermissionFilters {
  organizationId: string;
  subjectType?: PermissionSubjectType;
  subjectId?: string;
  permission?: string;
  resourceType?: string;
  resourceId?: string;
  orgUnitId?: string;
  effect?: PermissionEffect;
}

export interface ResourceContext {
  type: string;
  id?: string;
  orgUnitId?: string;
  attributes?: Record<string, unknown>;
}

export interface PermissionDecision {
  allowed: boolean;
  reason: string;
  source:
    | 'super_admin'
    | 'rbac'
    | 'custom_role'
    | 'resource_grant'
    | 'default_deny';
  evaluatedAt: Date;
}

export interface PermissionCheckParams {
  userId: string;
  tenantId: string;
  roles: string[];
  isSuperAdmin: boolean;
  permission: string;
  resource?: ResourceContext;
  userAttributes?: Record<string, unknown>;
}