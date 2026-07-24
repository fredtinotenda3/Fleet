// modules/tenancy/constants/hierarchy.constants.ts

import { OrgUnitType } from '@/modules/security/types/org-unit.types';

/**
 * Depth ordering for the org-unit portion of the tenant hierarchy.
 * Platform (above Organization) and User (below every org unit) are not
 * OrgUnit documents, so they aren't represented here â€” see
 * TENANT_HIERARCHY_LABELS for the full conceptual ladder.
 */
export const TENANT_LEVEL_ORDER: Record<OrgUnitType, number> = {
  branch: 1,
  department: 2,
  fleet: 2,
  workshop: 2,
  team: 3,
};

/**
 * Which parent types each org-unit type is allowed to nest under.
 * `null` means "must be top-level" (parentId: null, directly under the
 * organization). Validated by HierarchyValidationService on both create
 * and move.
 */
export const ALLOWED_PARENT_TYPES: Record<OrgUnitType, OrgUnitType[] | null> = {
  branch: null,
  department: ['branch'],
  team: ['department'],
  fleet: ['branch'],
  workshop: ['branch'],
};

export const TENANT_HIERARCHY_LABELS: Record<
  'platform' | 'organization' | OrgUnitType | 'user',
  string
> = {
  platform: 'Platform',
  organization: 'Organization',
  branch: 'Branch',
  department: 'Department',
  team: 'Team',
  fleet: 'Fleet',
  workshop: 'Workshop',
  user: 'User',
};