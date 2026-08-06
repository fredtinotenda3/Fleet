// modules/tenancy/constants/hierarchy.constants.ts

import { OrgUnitType } from '@/modules/security/types/org-unit.types';

/**
 * The full tenancy ladder this product supports:
 *
 *   Platform
 *     +-- Organization
 *           +-- Branch
 *                 +-- Department
 *                       +-- Workshop
 *                             +-- Fleet
 *                                   +-- Users
 *
 * Platform and Organization are not OrgUnit documents (they are the
 * PLATFORM_SCOPE_TENANT_ID sentinel and a tblorganizations row
 * respectively), and Users attach to a unit through a
 * UserScopeAssignment rather than being units themselves. Everything
 * between Organization and Users is an OrgUnit row and is represented
 * here.
 */

/**
 * Depth of each org-unit type in the canonical ladder above.
 *
 * CHANGED: `fleet` and `workshop` were both 2, i.e. siblings of
 * `department`. That encoded a flat Branch -> {Department | Fleet |
 * Workshop} model and made isAncestorLevel('workshop', 'fleet') false in
 * both directions, so a Workshop Manager could never be recognised as
 * sitting above a fleet even when the fleet was nested inside their
 * workshop. The canonical ladder makes them distinct depths.
 *
 * This is an ORDERING, not a required nesting depth -- a real tree may
 * still put a fleet directly under a branch (see ALLOWED_PARENT_TYPES),
 * in which case its stored `depth` is 1, not 4. Use this constant to
 * compare TYPES; use OrgUnit.depth to know where a specific unit sits.
 */
export const TENANT_LEVEL_ORDER: Record<OrgUnitType, number> = {
  branch: 1,
  department: 2,
  workshop: 3,
  fleet: 4,
  team: 5,
};

/**
 * Which parent types each org-unit type may nest under. `null` means
 * "must be top-level" (parentId: null, directly under the organization).
 * Validated by HierarchyValidationService on both create and move.
 *
 * WIDENED (backward compatible -- every previously legal tree stays
 * legal). The previous map allowed only:
 *
 *   department -> branch     workshop -> branch
 *   fleet      -> branch     team     -> department
 *
 * which made the requested Branch -> Department -> Workshop -> Fleet
 * chain impossible to build: a workshop could not sit inside a
 * department, and a fleet could not sit inside a workshop. Creating one
 * threw ValidationError.
 *
 * Each type now accepts any strictly-shallower type as a parent, so both
 * the flat model already in production and the full ladder are
 * expressible. What is still enforced is that a unit can never nest
 * under an equal-or-deeper type, which is what prevents cycles and
 * nonsense like a branch inside a team.
 */
export const ALLOWED_PARENT_TYPES: Record<OrgUnitType, OrgUnitType[] | null> = {
  /** Branches are the top level within an organization. */
  branch: null,
  /** Departments divide a branch. */
  department: ['branch'],
  /** A workshop may serve a whole branch, or belong to one department. */
  workshop: ['branch', 'department'],
  /** A fleet may be held at branch, department, or workshop level. */
  fleet: ['branch', 'department', 'workshop'],
  /** Teams are the leaf grouping and may hang off any deeper unit. */
  team: ['department', 'workshop', 'fleet'],
};

export const TENANT_HIERARCHY_LABELS: Record<
  'platform' | 'organization' | OrgUnitType | 'user',
  string
> = {
  platform: 'Platform',
  organization: 'Organization',
  branch: 'Branch',
  department: 'Department',
  workshop: 'Workshop',
  fleet: 'Fleet',
  team: 'Team',
  user: 'User',
};

/**
 * The ladder as an ordered list, for UI breadcrumbs, the org-unit
 * creation wizard's type picker, and the hierarchy documentation.
 */
export const TENANT_HIERARCHY_ORDER: Array<
  'platform' | 'organization' | OrgUnitType | 'user'
> = [
  'platform',
  'organization',
  'branch',
  'department',
  'workshop',
  'fleet',
  'team',
  'user',
];

/** Maximum org-unit nesting depth, guarding against pathological trees. */
export const MAX_ORG_UNIT_DEPTH = 6;
