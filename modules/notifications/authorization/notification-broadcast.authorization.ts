// modules/notifications/authorization/notification-broadcast.authorization.ts
//
// FIX (Phase C -- notifications hierarchy filtering, write-path
// security): the notification read path (NotificationRepository /
// NotificationService's *InScope methods) already scopes correctly.
// This module is the equivalent gate for the write path -- who is
// allowed to create a broadcast notification, and to which orgUnitId --
// and it is deliberately *not* a new engine. It's a thin composition of
// three pieces that already exist and are already trusted elsewhere:
//
//   1. permissionService.hasPermission() -- the same static-RBAC check
//      (server/permissions/roles.ts) every other permission-gated
//      action in the codebase uses.
//   2. tenantContextService.resolveContext() -- the same server-
//      authoritative scope resolver (real UserScopeAssignment records +
//      orgUnitRepository.getDescendantIds()) TenantScopedRepository
//      reads already go through.
//   3. tenantScopeService.canAccessOrgUnit() -- the exact predicate
//      form of the filter TenantScopedRepository queries already build.
//
// No hierarchy-walking, permission-list, or scope logic is duplicated
// here; this file only sequences existing checks and turns "false" into
// a 403.
//
// NOTE: server/permissions/permission-engine.service.ts (the layered
// resource-grant + custom-role + static-RBAC + default-deny engine
// described in the org audit, with its canPerform() entry point) was
// not available when this was written -- step 1 below uses the
// confirmed static-RBAC layer (permissionService) instead. If/when
// permission-engine.service.ts is available, swap step 1 for a single
// `await permissionEngineService.canPerform(userId, tenantId,
// Permission.NOTIFICATION_BROADCAST)` call; steps 2-3 are unaffected.

import {
  Permission,
  permissionService,
} from '@/server/permissions/roles';
import {
  tenantContextService,
  TenantContext,
} from '@/modules/tenancy/services/tenant-context.service';
import { tenantScopeService } from '@/modules/tenancy/services/tenant-scope.service';
import { ForbiddenError } from '@/server/errors/app.errors';

export interface BroadcastAuthorizationInput {
  userId: string;
  tenantId: string;
  roles: string[];
  isSuperAdmin: boolean;
  activeOrgUnitId?: string;
  /** The orgUnitId the caller wants to broadcast to. */
  targetOrgUnitId: string;
}

/**
 * Throws ForbiddenError if the caller may not broadcast at all, or may
 * not broadcast to `targetOrgUnitId` specifically. Returns the resolved
 * TenantContext on success (callers that need it afterwards -- e.g. for
 * an audit log entry -- don't have to resolve it twice).
 *
 * Requirement coverage:
 *  - Platform Admin (isSuperAdmin / SUPER_ADMIN) -- step 1 passes via
 *    the isSuperAdmin short-circuit (matches the isSuperAdmin bypass
 *    pattern already used in BaseRepository.getTenantFilter() and
 *    TenantContextService.resolveContext() itself); step 3 passes
 *    because resolveContext() gives super admins accessibleOrgUnitIds:
 *    null, and canAccessOrgUnit() treats null as unrestricted.
 *  - Organization Owner / Organization Admin -- same as above: both are
 *    in FULL_ORG_UNIT_VISIBILITY_ROLES, so resolveContext() also
 *    returns accessibleOrgUnitIds: null for them (unrestricted within
 *    their own tenant -- resolveContext() is already tenant-scoped by
 *    `tenantId`, so this can never cross into another organization).
 *  - Branch / Fleet / Workshop Manager -- step 1 passes only because
 *    NOTIFICATION_BROADCAST was added to exactly these three roles'
 *    permission lists in roles.ts. Step 3: resolveContext() resolves
 *    their UserScopeAssignment(s) to a concrete accessibleOrgUnitIds
 *    array containing their assigned unit id *and every descendant* (it
 *    already calls orgUnitRepository.getDescendantIds() per
 *    assignment). canAccessOrgUnit() then does an exact membership
 *    check against that array -- so a target inside their hierarchy
 *    passes, and a sibling/ancestor/unrelated unit fails, with no new
 *    hierarchy code written here.
 *  - Driver / Mechanic / Viewer / any other role -- none of these carry
 *    NOTIFICATION_BROADCAST, so step 1 throws before scope is even
 *    resolved. 403, not a silent empty result.
 */
export async function authorizeBroadcast(
  input: BroadcastAuthorizationInput
): Promise<TenantContext> {
  const { userId, tenantId, roles, isSuperAdmin, activeOrgUnitId, targetOrgUnitId } = input;

  // Step 1 -- role gate.
  if (!isSuperAdmin && !permissionService.hasPermission(roles, Permission.NOTIFICATION_BROADCAST)) {
    throw new ForbiddenError('You do not have permission to broadcast notifications');
  }

  // Step 2 -- resolve the caller's real, server-authoritative scope.
  const context = await tenantContextService.resolveContext(
    userId,
    tenantId,
    roles,
    isSuperAdmin,
    activeOrgUnitId
  );

  // Step 3 -- the target org unit must be inside that resolved scope.
  if (!tenantScopeService.canAccessOrgUnit(context, targetOrgUnitId)) {
    throw new ForbiddenError('You do not have access to broadcast to this org unit');
  }

  return context;
}