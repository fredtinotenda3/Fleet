// server/auth/auth-context.ts

import { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { Permission, Role, permissionService } from '@/server/permissions/roles';
import { UnauthorizedError } from '@/server/errors/app.errors';
import { permissionEngineService } from '@/modules/security/services/permission-engine.service';
import { PermissionDecision, ResourceContext } from '@/modules/security/types/resource-permission.types';
import { sessionService } from '@/modules/security/services/session.service';
import { apiKeyService } from '@/modules/security/services/api-key.service';

export interface AuthContext {
  userId: string;
  tenantId: string;
  roles: string[];
  permissions: Permission[];
  isSuperAdmin: boolean;
  /**
   * Optional active branch/department/fleet scope for this request,
   * resolved from the `x-org-unit-id` header or `orgUnitId` query param.
   */
  orgUnitId?: string;
  /** Present only for NextAuth cookie-based sessions; ties this request
   *  back to a revocable UserSession record (see modules/security). */
  sessionId?: string;
  /** True when this request was authenticated via an API key rather
   *  than a user session. */
  isApiKey?: boolean;
  apiKeyId?: string;
}

function getClientIp(req: NextRequest): string | undefined {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined;
}

async function getAuthContextFromApiKey(req: NextRequest): Promise<AuthContext | null> {
  const header = req.headers.get('authorization');
  const apiKeyHeader = req.headers.get('x-api-key');

  let presentedKey: string | null = null;
  if (apiKeyHeader) {
    presentedKey = apiKeyHeader.trim();
  } else if (header?.toLowerCase().startsWith('apikey ')) {
    presentedKey = header.slice('apikey '.length).trim();
  }

  if (!presentedKey || !presentedKey.startsWith('fk_live_')) {
    return null;
  }

  const record = await apiKeyService.verifyKey(presentedKey, getClientIp(req));
  if (!record) {
    return null;
  }

  return {
    userId: `api-key:${record._id}`,
    tenantId: record.organizationId,
    roles: [],
    permissions: record.permissions as Permission[],
    isSuperAdmin: false,
    isApiKey: true,
    apiKeyId: record._id,
  };
}

/**
 * Single canonical place that resolves a request's auth context.
 *
 * Resolution order:
 *   1. API key (X-API-Key header or `Authorization: ApiKey <key>`) —
 *      machine-to-machine credentials, checked first since ruling them
 *      out is a cheap prefix check that never touches the NextAuth
 *      cookie/JWT machinery.
 *   2. NextAuth session JWT — the browser cookie flow, hardened here
 *      with a live revocation check against the UserSession store via
 *      the token's `sid` claim (stamped by lib/authOptions.ts at
 *      sign-in, alongside creating the matching UserSession row).
 *
 * Both paths converge on the same AuthContext shape so every downstream
 * consumer (withAuth, canPerform, controllers) works identically
 * regardless of which credential type authenticated the request.
 */
export async function getAuthContext(req: NextRequest): Promise<AuthContext | null> {
  const apiKeyContext = await getAuthContextFromApiKey(req);
  if (apiKeyContext) {
    return apiKeyContext;
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) return null;

  const roles: string[] = (token as any).roles || ['viewer'];

  /**
   * FIX (critical -- total tenant-isolation bypass, reintroduced here):
   * `isSuperAdmin` below is intentionally `true` for BOTH SUPER_ADMIN
   * (true platform admin) AND ORGANIZATION_OWNER (full access, but only
   * within THEIR OWN tenant) -- that split is correct for permission
   * checks (hasPermission/hasRole/canPerform all want org owners to
   * bypass RBAC checks within their tenant).
   *
   * It is NOT correct for tenantId resolution. The line that used to be
   * here:
   *   const tenantId = isSuperAdmin ? 'default' : (token as any).tenantId || 'default';
   * collapsed EVERY organization_owner's tenantId down to the literal
   * sentinel string 'default' -- discarding their real per-tenant
   * tenantId from the JWT. BaseRepository.getTenantFilter() (and every
   * repository's isSuperAdminTenant() copy of the same rule) treats
   * 'default' as "skip tenant filtering entirely, return everything."
   * The practical effect: every organization owner -- not just true
   * platform super admins -- saw every other tenant's vehicles,
   * expenses, fuel logs, trips, and maintenance records on every list/
   * stats/analytics endpoint in the app. This is the exact bypass class
   * documented as fixed in lib/authOptions.ts's jwt() callback, silently
   * reintroduced one layer up in this canonical context resolver that
   * every route ultimately depends on.
   *
   * Only a literal SUPER_ADMIN role gets the platform-wide sentinel
   * tenant. ORGANIZATION_OWNER always keeps their real tenantId from the
   * token, so tenant-scoped queries stay correctly scoped to their own
   * organization while still bypassing RBAC permission checks within it.
   */
  const isPlatformSuperAdmin = roles.includes(Role.SUPER_ADMIN);
  const isSuperAdmin = isPlatformSuperAdmin || roles.includes(Role.ORGANIZATION_OWNER);

  const permissions = roles
    .flatMap((role) => permissionService.getPermissionsForRole(role as Role))
    .filter((value, index, all) => all.indexOf(value) === index);

  const tenantId = isPlatformSuperAdmin ? 'default' : (token as any).tenantId || 'default';
  const sessionId = (token as any).sid as string | undefined;

  if (sessionId) {
    const valid = await sessionService.isSessionValid(sessionId, tenantId).catch(() => true);
    if (!valid) {
      // The session backing this JWT has been explicitly revoked (e.g.
      // "log out this device" from another session, or an admin forcing
      // a logout). The JWT signature is still cryptographically valid —
      // stateless JWTs can't be un-signed — but the session it points to
      // no longer exists, so treat the request as unauthenticated. Fails
      // open on infrastructure errors so a session-store hiccup never
      // locks every user out of the app.
      return null;
    }
    sessionService.touchSession(sessionId, tenantId).catch(() => undefined);
  }

  const orgUnitId =
    req.headers.get('x-org-unit-id') || req.nextUrl.searchParams.get('orgUnitId') || undefined;

  return {
    userId: token.sub as string,
    tenantId,
    roles,
    permissions,
    isSuperAdmin,
    orgUnitId: orgUnitId || undefined,
    sessionId,
  };
}

export async function requireAuthContext(req: NextRequest): Promise<AuthContext> {
  const context = await getAuthContext(req);
  if (!context) {
    throw new UnauthorizedError('Authentication required');
  }
  return context;
}

export function hasPermission(context: AuthContext, permission: Permission): boolean {
  return context.isSuperAdmin || context.permissions.includes(permission);
}

export function hasAnyPermission(context: AuthContext, permissions: Permission[]): boolean {
  return context.isSuperAdmin || permissions.some((p) => context.permissions.includes(p));
}

export function hasAllPermissions(context: AuthContext, permissions: Permission[]): boolean {
  return context.isSuperAdmin || permissions.every((p) => context.permissions.includes(p));
}

export function hasRole(context: AuthContext, roles: string[]): boolean {
  return context.isSuperAdmin || context.roles.some((r) => roles.includes(r));
}

export async function canPerform(
  context: AuthContext,
  permission: string,
  resource?: ResourceContext,
  userAttributes?: Record<string, unknown>
): Promise<PermissionDecision> {
  return permissionEngineService.can({
    userId: context.userId,
    tenantId: context.tenantId,
    roles: context.roles,
    isSuperAdmin: context.isSuperAdmin,
    permission,
    resource: resource || (context.orgUnitId ? { type: 'org_unit', orgUnitId: context.orgUnitId } : undefined),
    userAttributes,
  });
}