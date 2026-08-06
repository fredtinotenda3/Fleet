// server/tenancy/tenant-scope.ts
//
// SINGLE SOURCE OF TRUTH for "what tenant is this query scoped to".
//
// ---------------------------------------------------------------------
// Why this file exists
// ---------------------------------------------------------------------
// The rule "which tenantId values mean 'skip tenant filtering'" was
// previously reimplemented independently in ten places:
//
//   server/repositories/base.repository.ts        (isPlatformSentinelTenant)
//   server/auth/auth-context.ts                   (inline 'default' literal)
//   modules/tenancy/services/tenant-context.service.ts (SENTINEL_TENANT_IDS)
//   modules/vehicles/repositories/vehicle.repository.ts    (isSuperAdminTenant)
//   modules/vehicles/queries/handlers/get-vehicle-by-id.handler.ts
//   modules/trips/repositories/trip.repository.ts          (isSuperAdminTenant)
//   modules/fuel/repositories/fuel.repository.ts           (isSuperAdminTenant)
//   modules/expenses/repositories/expense.repository.ts    (isSuperAdminTenant)
//   modules/maintenance/repositories/maintenance.repository.ts
//   modules/reporting/repositories/dashboard.repository.ts
//
// Those copies drifted from each other (base.repository.ts's own comments
// document a production bug where the dashboard and the list page
// disagreed on what "see everything" meant). Every copy is now deleted
// and delegates here.
//
// ---------------------------------------------------------------------
// The security model, and what changed
// ---------------------------------------------------------------------
// OLD (fail-OPEN):
//   the literal strings 'default' | 'system' | 'super_admin' silently
//   meant "return every tenant's rows". `lib/authOptions.ts` assigned
//   'default' to any user whose tbladmin record had no tenantId -- i.e.
//   every account predating multi-tenancy. Those users saw, and wrote,
//   across every organization. Imports run by such a user stamped
//   tenantId: 'default' onto the created rows, which is the direct
//   cause of "vehicles from another organization appearing in mine".
//
// NEW (fail-CLOSED):
//   1. There is exactly ONE value that means platform-wide scope:
//      PLATFORM_SCOPE_TENANT_ID. It is deliberately spelled with
//      double underscores so it cannot collide with a real organization
//      id (a Mongo ObjectId hex string) and is rejected by
//      assertUsableAsTenantId() at organization-creation time.
//   2. The legacy strings 'default' | 'system' | 'super_admin' no longer
//      grant anything. They are REJECTED -- resolveTenantScope() throws
//      TenantScopeError. A value that used to mean "see everything" now
//      means "this request is misconfigured, refuse it".
//   3. An empty/undefined tenantId is likewise a hard error, never a
//      silent fallback.
//
// The practical effect: a missing or legacy tenant id can no longer
// escalate into cross-tenant access. The worst it can do is fail the
// request loudly, which is what you want it to do.
//
// OPERATIONAL PREREQUISITE -- READ BEFORE DEPLOYING:
//   Existing tbladmin accounts with no tenantId will be unable to log in
//   after this change (see lib/authOptions.ts). Run
//   `npm run db:backfill-user-tenants` FIRST. It is idempotent and
//   reports what it would change before changing anything.

import { AppError } from '@/server/errors/app.errors';

/**
 * The one and only value meaning "platform-wide, unscoped access".
 *
 * Only ever produced by server/auth/auth-context.ts for a caller
 * holding the literal SUPER_ADMIN role. Notably NOT produced for
 * ORGANIZATION_OWNER -- an org owner bypasses RBAC permission checks
 * within their own tenant, but never leaves it. See AuthContext's
 * `canBypassRbac` vs `isPlatformAdmin` split.
 */
export const PLATFORM_SCOPE_TENANT_ID = '__platform__';

/**
 * Owner value for records that genuinely belong to the PLATFORM rather
 * than to any customer: the plugin catalogue, system-level cron job
 * definitions. These are real persisted rows, so they need a real owner.
 *
 * Deliberately distinct from PLATFORM_SCOPE_TENANT_ID. The difference is
 * the whole point:
 *
 *   PLATFORM_SCOPE_TENANT_ID  -- a READER scope meaning "see everything".
 *                                Never persisted (assertUsableAsTenantId
 *                                refuses it).
 *   PLATFORM_OWNER_TENANT_ID  -- an OWNER value. Persisted freely, and
 *                                grants NO read privilege whatsoever: a
 *                                caller scoped to it sees only
 *                                system-owned rows, never customer data.
 *
 * This replaces two hardcoded `tenantId: 'system'` writes (the plugin
 * registry and the cron engine) that previously used a legacy sentinel --
 * i.e. wrote rows that the old fail-open filter would then expose to
 * everyone.
 */
export const PLATFORM_OWNER_TENANT_ID = '__system_owned__';


/**
 * Values that USED to mean "skip tenant filtering" and now mean
 * "refuse the request". Kept as an explicit named set so the failure
 * message can tell an operator exactly what went wrong rather than
 * surfacing a generic error.
 */
export const REJECTED_LEGACY_SENTINEL_TENANT_IDS: ReadonlySet<string> =
  new Set(['default', 'system', 'super_admin']);

/** True for 'default' | 'system' | 'super_admin' -- values that used to
 *  disable tenant filtering and are now refused. */
export function isLegacySentinelTenant(value: unknown): boolean {
  return (
    typeof value === 'string' &&
    REJECTED_LEGACY_SENTINEL_TENANT_IDS.has(value.trim().toLowerCase())
  );
}

export class TenantScopeError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 'TENANT_SCOPE_ERROR', 403, details);
  }
}

export type TenantScope =
  | { kind: 'platform' }
  | { kind: 'tenant'; tenantId: string };

/**
 * Resolves a raw tenantId into an explicit, validated scope.
 *
 * Throws rather than returning a permissive default. Every caller that
 * previously relied on an implicit bypass now gets a 403 with a
 * message naming the cause.
 */
export function resolveTenantScope(
  tenantId: string | null | undefined,
  options: { isPlatformAdmin?: boolean } = {}
): TenantScope {
  if (options.isPlatformAdmin === true) {
    return { kind: 'platform' };
  }

  if (tenantId === PLATFORM_SCOPE_TENANT_ID) {
    return { kind: 'platform' };
  }

  if (typeof tenantId !== 'string' || tenantId.trim().length === 0) {
    throw new TenantScopeError(
      'Request has no tenant scope. This is a fail-closed refusal: a missing ' +
        'tenantId previously defaulted to platform-wide access. The caller ' +
        'must be associated with an organization.'
    );
  }

  const normalized = tenantId.trim();

  if (REJECTED_LEGACY_SENTINEL_TENANT_IDS.has(normalized.toLowerCase())) {
    throw new TenantScopeError(
      `Rejected legacy sentinel tenant id "${normalized}". This value used to ` +
        'disable tenant filtering entirely and is no longer honoured. The ' +
        'account or record carrying it must be assigned a real organization ' +
        'id (run: npm run db:repair).',
      { tenantId: normalized }
    );
  }

  return { kind: 'tenant', tenantId: normalized };
}

/**
 * True when the scope is platform-wide. Prefer resolveTenantScope() and
 * a switch on `kind`; this helper exists for call sites that only need
 * the boolean.
 */
export function isPlatformScope(
  tenantId: string | null | undefined,
  options: { isPlatformAdmin?: boolean } = {}
): boolean {
  return resolveTenantScope(tenantId, options).kind === 'platform';
}

/**
 * Guard for anywhere a tenantId is about to be PERSISTED (organization
 * creation, seed scripts, import pipelines). Prevents a row from ever
 * being written carrying the platform sentinel or a legacy value --
 * which is how the current database got into its present state.
 */
export function assertUsableAsTenantId(tenantId: string): string {
  const scope = resolveTenantScope(tenantId);
  if (scope.kind === 'platform') {
    throw new TenantScopeError(
      'Refusing to persist a record scoped to the platform sentinel tenant. ' +
        'Records must belong to a real organization.',
      { tenantId }
    );
  }
  return scope.tenantId;
}
