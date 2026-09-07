// server/tenancy/write-scope.ts
//
// The authority a write is being performed under.
//
// ---------------------------------------------------------------------
// Why this type exists
// ---------------------------------------------------------------------
// Ten write paths in this codebase resolved a vehicle from a
// caller-supplied `license_plate` like this:
//
//     const vehicle = await db.collection('tblvehicles').findOne({
//       license_plate: String(plate).toUpperCase(),
//       isDeleted: { $ne: true },
//     });
//
// with no tenantId filter and no org-unit check, and then copied
// `vehicle.orgUnitId` onto the record being written. Three separate
// defects follow from that one query:
//
//   1. CROSS-TENANT. `license_plate` has no unique index and is not
//      unique across tenants (this deployment's own data has two
//      distinct organizations both named "Toyota Zimbabwe"). A fuel log
//      created in tenant A could resolve tenant B's vehicle and inherit
//      B's orgUnitId. The row stays in A, so it is not a read leak -- it
//      is worse in a different way: A's own financial record is now
//      keyed to a foreign org unit, and the 200-vs-400 response is an
//      oracle for whether another tenant owns a given plate.
//
//   2. CROSS-ORG-UNIT. There was no scope check at all, so a Harare
//      branch manager could file a fuel log against a Bulawayo vehicle.
//      The row inherits Bulawayo's orgUnitId and immediately disappears
//      from the creator's own scoped list. Users read that as data loss,
//      and it is the reported "branch manager sees incomplete branch
//      data" symptom.
//
//   3. AMBIGUOUS PLATE. `findOne` silently returns whichever document
//      Mongo reached first. Two active vehicles sharing a plate -- which
//      nothing in the schema prevents -- means costs land against an
//      arbitrary one of them, forever, with no error.
//
// The fix is not "add tenantId to ten queries". Ten copies of a security
// decision drift; this repository has already paid for that twice (see
// the header of server/tenancy/tenant-scope.ts, and the three
// byte-identical resolveTenantContext copies documented in
// server/utils/tenant-context.utils.ts). The fix is one resolver that
// every write path calls, and a parameter type that makes forgetting to
// scope a write impossible to express.
//
// ---------------------------------------------------------------------
// Why it is a required discriminated union and not an optional context
// ---------------------------------------------------------------------
// An `context?: TenantContext` parameter would let the next call site
// reproduce exactly the omission this file exists to remove, and still
// type-check. This mirrors the decision recorded for
// createAlert/ResolvedAlertOwnership: the safe thing has to be the only
// thing that compiles.
//
// So a caller must state which of two situations it is in:
//
//   - `user`   -- a request made on behalf of a signed-in caller. Their
//                 TenantContext is carried, and org-unit scope IS
//                 enforced.
//   - `system` -- a background job, a worker, a rule-engine action or a
//                 bulk import with no single acting user. Tenant scope
//                 is still enforced; org-unit scope is not, because
//                 there is no user whose scope it could be checked
//                 against. `reason` is required and is a free-text note
//                 for the reviewer of the next audit -- it exists so
//                 that choosing the unchecked branch is a visible,
//                 deliberate act rather than a default.
//
// There is deliberately no third "unscoped" member. Nothing in this
// product may resolve an entity across a tenant boundary.

import { TenantContext } from '@/modules/tenancy/services/tenant-context.service';

export type WriteScope =
  | { readonly kind: 'user'; readonly context: TenantContext }
  | { readonly kind: 'system'; readonly tenantId: string; readonly reason: string };

/** A write performed for a signed-in caller. Org-unit scope is enforced. */
export function userWriteScope(context: TenantContext): WriteScope {
  return { kind: 'user', context };
}

/**
 * A write with no acting user (worker, cron, rule action, bulk import).
 * Tenant scope is still enforced; org-unit scope cannot be, because
 * there is no user scope to check against.
 *
 * @param reason why this write has no user scope. Required so the
 *   unchecked branch is never reachable by accident.
 */
export function systemWriteScope(tenantId: string, reason: string): WriteScope {
  if (!reason.trim()) {
    throw new Error('systemWriteScope requires a non-empty reason');
  }
  return { kind: 'system', tenantId, reason };
}

/** The tenant a write scope acts within, whichever kind it is. */
export function tenantIdOf(scope: WriteScope): string {
  return scope.kind === 'user' ? scope.context.organizationId : scope.tenantId;
}

/**
 * The org units this scope may write into, or `null` when org-unit
 * scope does not apply (an org-wide role, or a system write).
 *
 * `null` means "not narrowed", NOT "no access" -- it matches
 * TenantContext.accessibleOrgUnitIds' own convention so the two cannot
 * be confused at a call site. An empty array means narrowed to nothing
 * and must fail closed.
 */
export function accessibleOrgUnitIdsOf(scope: WriteScope): string[] | null {
  return scope.kind === 'user' ? scope.context.accessibleOrgUnitIds : null;
}
