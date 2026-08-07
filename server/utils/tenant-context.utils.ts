// server/utils/tenant-context.utils.ts
//
// The one helper every controller uses to turn a request into a
// TenantContext.
//
// ---------------------------------------------------------------------
// Why this is shared rather than copied
// ---------------------------------------------------------------------
// Before this file, `resolveTenantContext(req)` was defined as a private
// module-level function INSIDE each of fuel.controller.ts,
// expense.controller.ts and trip.controller.ts -- three byte-identical
// copies. Wiring five more modules the same way would have made eight.
//
// That matters because this function is a security boundary. Every copy
// is a place where someone can "fix" a 403 by loosening the resolution
// (defaulting a missing tenant, swallowing the ForbiddenError from an
// out-of-scope x-org-unit-id header) and have it apply to only one
// module, so the divergence is invisible in review. That is exactly how
// the codebase acquired ten independent copies of the tenant-sentinel
// rule that then drifted apart -- documented at the top of
// server/tenancy/tenant-scope.ts.
//
// One definition, one place to audit.

import { NextRequest } from 'next/server';
import { getAuthContext } from '@/server/auth/auth-context';
import { UnauthorizedError, ForbiddenError } from '@/server/errors/app.errors';
import {
  tenantContextService,
  TenantContext,
} from '@/modules/tenancy/services/tenant-context.service';

/**
 * Resolves the caller's full tenant context: organization, plus the
 * expanded set of org units they may read.
 *
 * Throws UnauthorizedError when unauthenticated. Propagates
 * ForbiddenError/NotFoundError from resolveContext() -- notably when the
 * `x-org-unit-id` header names a unit outside the caller's scope, which
 * must fail rather than be quietly ignored, since ignoring it silently
 * widens the query back to the caller's whole assigned scope.
 */
export async function resolveTenantContext(req: NextRequest): Promise<TenantContext> {
  const authContext = await getAuthContext(req);
  if (!authContext) {
    throw new UnauthorizedError('Authentication required');
  }
  return tenantContextService.resolveContext(
    authContext.userId,
    authContext.tenantId,
    authContext.roles,
    authContext.isPlatformAdmin,
    authContext.orgUnitId
  );
}

/**
 * The userId of the caller, resolved from the same auth context.
 *
 * Controllers that previously called both getTenantFromRequest(req) and
 * getUserIdFromRequest(req) did two independent credential resolutions
 * per request. Where a controller now needs both a context and a userId,
 * prefer resolveTenantContextWithUser() to keep it to one.
 */
export async function resolveTenantContextWithUser(
  req: NextRequest
): Promise<{ context: TenantContext; userId: string }> {
  const authContext = await getAuthContext(req);
  if (!authContext) {
    throw new UnauthorizedError('Authentication required');
  }
  const context = await tenantContextService.resolveContext(
    authContext.userId,
    authContext.tenantId,
    authContext.roles,
    authContext.isPlatformAdmin,
    authContext.orgUnitId
  );
  return { context, userId: authContext.userId };
}

/**
 * Decides which org unit a NEWLY CREATED record belongs to.
 *
 * ---------------------------------------------------------------------
 * Why creation needs its own rule
 * ---------------------------------------------------------------------
 * Scoped READS were fixed first, and that alone produces a trap: a
 * branch manager who creates a vehicle gets a row with NO orgUnitId,
 * which the scoped read filter then hides from them. They add a vehicle
 * and watch it vanish. That is worse than the original leak, because it
 * looks like data loss.
 *
 * Rules, in order:
 *   - org-wide caller (accessibleOrgUnitIds === null): honour whatever
 *     they chose, including nothing. They can legitimately file a record
 *     under any unit, which is what makes "owner adds a vehicle to
 *     Bulawayo Branch" work.
 *   - scoped caller who named a unit: allowed only if that unit is
 *     inside their accessible set. Otherwise this is a write-side
 *     escalation -- creating a record in another branch -- and it is
 *     refused rather than silently rewritten.
 *   - scoped caller who named nothing: default to their primary assigned
 *     unit. `assignedOrgUnitIds` is used rather than
 *     `accessibleOrgUnitIds` deliberately: the accessible set includes
 *     inherited descendants, and filing a new record into an arbitrary
 *     descendant (say a fleet nested three levels down) rather than the
 *     unit the user actually belongs to would be a guess.
 *   - scoped caller with no assignment at all: refused. There is no
 *     correct unit, and an unassigned record is invisible to everyone
 *     except org-wide roles.
 */
export function resolveCreationOrgUnitId(
  context: TenantContext,
  requestedOrgUnitId?: unknown
): string | undefined {
  const requested =
    typeof requestedOrgUnitId === 'string' && requestedOrgUnitId.trim()
      ? requestedOrgUnitId.trim()
      : undefined;

  if (context.accessibleOrgUnitIds === null) {
    return requested;
  }

  if (requested) {
    if (!context.accessibleOrgUnitIds.includes(requested)) {
      throw new ForbiddenError(
        'You cannot create records in an org unit outside your assigned scope.'
      );
    }
    return requested;
  }

  const primary = context.assignedOrgUnitIds[0] ?? context.accessibleOrgUnitIds[0];
  if (!primary) {
    throw new ForbiddenError(
      'You have no org unit assignment, so records cannot be created. ' +
        'Ask an administrator to assign you to a branch, department, workshop or fleet.'
    );
  }
  return primary;
}
