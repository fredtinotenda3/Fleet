// modules/security/types/user-scope-assignment.types.ts

import { BaseEntity } from '@/shared/types/common.types';

/**
 * Assigns a user a role (static or custom) scoped to a specific org unit
 * (branch, department, or fleet), distinct from their organization-wide
 * role stored on OrganizationMember. A user can hold different
 * effective roles in different branches/fleets via these records.
 */
export interface UserScopeAssignment extends BaseEntity {
  organizationId: string;
  userId: string;
  orgUnitId: string;
  role: string;
  isCustomRole: boolean;
  assignedBy?: string;
}

export interface UserScopeAssignmentCreateDTO {
  organizationId: string;
  userId: string;
  orgUnitId: string;
  role: string;
  isCustomRole?: boolean;
}