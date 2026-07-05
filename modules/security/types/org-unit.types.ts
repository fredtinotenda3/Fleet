// modules/security/types/org-unit.types.ts

import { BaseEntity } from '@/shared/types/common.types';

export type OrgUnitType = 'branch' | 'department' | 'fleet' | 'workshop' | 'team';
export type OrgUnitStatus = 'active' | 'inactive';

export interface OrgUnit extends BaseEntity {
  organizationId: string;
  type: OrgUnitType;
  name: string;
  code?: string;
  parentId?: string | null;
  path: string[];
  depth: number;
  managerId?: string;
  metadata?: Record<string, unknown>;
  status: OrgUnitStatus;
}

export interface OrgUnitCreateDTO {
  organizationId: string;
  type: OrgUnitType;
  name: string;
  code?: string;
  parentId?: string | null;
  managerId?: string;
  metadata?: Record<string, unknown>;
}

export interface OrgUnitUpdateDTO {
  name?: string;
  code?: string;
  /**
   * Present so OrgUnitHierarchyService.moveOrgUnit can describe the
   * "changes" it made in the OrgUnitUpdatedEvent it publishes. Moving an
   * org unit is handled outside OrgUnitService's normal update() path
   * (it cascades to descendants), so this field is informational only
   * for the event payload, not a field OrgUnitService.updateOrgUnit()
   * itself applies.
   */
  parentId?: string | null;
  managerId?: string | null;
  metadata?: Record<string, unknown>;
  status?: OrgUnitStatus;
}

export interface OrgUnitFilters {
  organizationId: string;
  type?: OrgUnitType;
  parentId?: string | null;
  status?: OrgUnitStatus;
}