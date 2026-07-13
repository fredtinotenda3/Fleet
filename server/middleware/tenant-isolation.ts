// server/middleware/tenant-isolation.ts

import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext, AuthContext } from '@/server/auth/auth-context';

/**
 * FIX (critical -- middleware consistency / session-revocation bypass):
 * this used to call next-auth's getToken() directly and rebuild
 * tenantId/isSuperAdmin from raw JWT claims, completely independently
 * of server/auth/auth-context.ts's getAuthContext(). Concretely, any
 * route wrapped with enforceTenantIsolation() instead of withAuth():
 *   1. Never checked session revocation. A user force-logged-out from
 *      another device, or an admin-revoked session, kept working here
 *      indefinitely -- a JWT's signature stays valid even after the
 *      session record backing it (sessionService) is deleted, and only
 *      the canonical getAuthContext() checks that.
 *   2. Didn't support API-key authentication, so any route using this
 *      middleware silently rejected valid API-key requests that work
 *      everywhere else in the app.
 * Now a thin wrapper around the single canonical getAuthContext(), so
 * every route gets identical authentication behavior regardless of
 * whether it's wrapped with this, withAuth(), or the helpers in
 * permission.middleware.ts.
 */
export async function enforceTenantIsolation(
  req: NextRequest,
  handler: (
    req: NextRequest,
    context: { userId: string; tenantId: string }
  ) => Promise<NextResponse>
): Promise<NextResponse> {
  const context: AuthContext | null = await getAuthContext(req);

  if (!context) {
    return NextResponse.json(
      {
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      },
      { status: 401 }
    );
  }

  // Check if requestor is trying to access a different tenant
  const requestTenantId =
    req.headers.get('x-tenant-id') ||
    req.nextUrl.searchParams.get('tenantId');

  if (
    requestTenantId &&
    requestTenantId !== context.tenantId &&
    !context.isSuperAdmin
  ) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Cross-tenant access denied',
        },
      },
      { status: 403 }
    );
  }

  return handler(req, { userId: context.userId, tenantId: context.tenantId });
}