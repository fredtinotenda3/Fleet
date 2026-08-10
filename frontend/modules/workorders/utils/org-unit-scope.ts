// frontend/modules/workorders/utils/org-unit-scope.ts
//
// NOT a security boundary. Multi-tenancy and org-unit scoping for work
// orders themselves are enforced entirely server-side (see
// server/tenancy/module-scope.registry.ts: workorders -> 'org-unit',
// orgUnitSource 'vehicle', and withAuth(...) on every
// app/api/workorders/** route). This file only narrows the *display*
// list of mechanics offered in the assign-mechanic picker so a
// Workshop Manager scoped to one workshop isn't shown every mechanic
// in the organization -- a UX convenience, not enforcement.
//
// It matters here specifically because WorkOrderService.assign()
// (modules/workorders/services/workorder.service.ts) stores whatever
// mechanicId string it's given with no server-side check that the
// mechanic is actually in scope for the caller, so this client-side
// filter is the only thing keeping the picker itself sensible today.
// If that gap is later closed on the backend, this helper can be
// relaxed to a pure display convenience without any change in
// behavior for a compliant client.

import type { OrganizationMember } from '@/frontend/modules/organizations';

const MECHANIC_ROLES = new Set(['mechanic', 'workshop_manager']);

/**
 * The signed-in user's own branch/workshop scope, if any. Mirrors
 * OrganizationMember.orgUnitId's documented meaning (shared/types/
 * organization.types.ts): undefined means the member's access follows
 * their org-wide role with no narrower restriction.
 */
export function getCurrentUserOrgUnitId(members: OrganizationMember[], userId: string | undefined): string | undefined {
  if (!userId) return undefined;
  return members.find((m) => m.userId === userId)?.orgUnitId;
}

/**
 * Active mechanics/workshop managers, narrowed to the current user's
 * org unit when the current user themselves is scoped to one. A
 * caller with no org-unit restriction (org-wide role) sees every
 * active mechanic, matching what they're actually allowed to assign
 * work to.
 */
export function scopeMechanicsForAssignment(
  members: OrganizationMember[],
  currentUserId: string | undefined
): OrganizationMember[] {
  const eligible = members.filter((m) => m.status === 'active' && MECHANIC_ROLES.has(m.role));
  const scopeOrgUnitId = getCurrentUserOrgUnitId(members, currentUserId);
  if (!scopeOrgUnitId) return eligible;
  return eligible.filter((m) => !m.orgUnitId || m.orgUnitId === scopeOrgUnitId);
}