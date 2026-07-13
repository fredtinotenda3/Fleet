// server/utils/context.utils.ts
//
// FIX (critical -- middleware consistency / session-revocation bypass):
// every helper in this file used to call next-auth's getToken() and
// rebuild tenantId/roles/isSuperAdmin from raw JWT claims directly,
// completely bypassing the canonical getAuthContext() in
// server/auth/auth-context.ts -- the same class of bug already fixed in
// server/middleware/permission.middleware.ts,
// server/middleware/tenant-isolation.ts, and
// infrastructure/security/middleware.ts. Concretely, these helpers never
// checked session revocation and never supported API-key auth.
//
// TenancyController (createOrgUnit, moveOrgUnit, getHierarchyTree) calls
// these directly. Every route that reaches those methods currently also
// goes through withAuth() first (which does check revocation), so this
// was not independently exploitable end-to-end today -- but any future
// route wired up without withAuth(), or any route added by someone who
// reasonably assumes "the app already checked auth", would inherit the
// gap silently. Now a thin wrapper over the single canonical
// getAuthContext(), so there is exactly one place session validity is
// decided.

import { NextRequest } from 'next/server';
import { getAuthContext } from '@/server/auth/auth-context';
import { UnauthorizedError } from '@/server/errors/app.errors';

async function requireContext(req: NextRequest) {
  const context = await getAuthContext(req);
  if (!context) {
    throw new UnauthorizedError('No authentication token found');
  }
  return context;
}

export async function getTenantFromRequest(req: NextRequest): Promise<string> {
  const context = await requireContext(req);
  return context.tenantId;
}

export async function getUserIdFromRequest(req: NextRequest): Promise<string> {
  const context = await requireContext(req);
  return context.userId;
}

export async function getUserRolesFromRequest(req: NextRequest): Promise<string[]> {
  const context = await requireContext(req);
  return context.roles.length > 0 ? context.roles : ['viewer'];
}

export async function isSuperAdmin(req: NextRequest): Promise<boolean> {
  const context = await getAuthContext(req);
  return context?.isSuperAdmin ?? false;
}