// server/middleware/permission.middleware.ts

import { NextRequest, NextResponse } from 'next/server';
import { Permission } from '@/server/permissions/roles';
import {
  AuthContext,
  getAuthContext as getCanonicalAuthContext,
  hasPermission as contextHasPermission,
  hasAnyPermission as contextHasAnyPermission,
  hasRole as contextHasRole,
} from '@/server/auth/auth-context';

/**
 * FIX (critical -- middleware consistency / session-revocation bypass):
 * this module used to define its own getAuthContext() that parsed the
 * NextAuth JWT directly, duplicating -- and drifting from -- the
 * canonical one in server/auth/auth-context.ts. Concretely, it never
 * checked session revocation and never supported API-key auth, so any
 * route using requirePermission()/requireAnyPermission()/requireRole()
 * from this file (instead of withAuth() in with-auth.ts) let a revoked
 * session's JWT keep authenticating, and rejected valid API-key
 * requests outright. It also exported a function literally named
 * getAuthContext with a *different return shape* than the canonical
 * one in auth-context.ts -- a same-named, different-shape export
 * sitting one import path away from the real one is exactly the kind
 * of thing that gets silently mis-imported by a future route.
 *
 * This file now re-exports the canonical AuthContext type and builds
 * requirePermission/requireAnyPermission/requireRole on top of the
 * single getAuthContext() in server/auth/auth-context.ts, so every
 * route gets identical authentication + session-revocation behavior
 * whether it's wrapped with withAuth() or these helpers directly.
 *
 * Prefer withAuth() (server/middleware/with-auth.ts) for new routes --
 * it additionally gives rate limiting, API-version headers, and
 * request tracing/metrics for free. These helpers remain for routes
 * that haven't been migrated to withAuth() yet.
 */
export type { AuthContext };

export async function getAuthContext(req: NextRequest): Promise<AuthContext | null> {
  return getCanonicalAuthContext(req);
}

function unauthorized() {
  return NextResponse.json(
    {
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    },
    { status: 401 }
  );
}

function forbidden(message: string) {
  return NextResponse.json(
    { success: false, error: { code: 'FORBIDDEN', message } },
    { status: 403 }
  );
}

export function requirePermission(permission: Permission) {
  return async (
    req: NextRequest,
    handler: (req: NextRequest, context: AuthContext) => Promise<NextResponse>
  ) => {
    const context = await getCanonicalAuthContext(req);
    if (!context) return unauthorized();
    if (!contextHasPermission(context, permission)) {
      return forbidden('Insufficient permissions');
    }
    return handler(req, context);
  };
}

export function requireAnyPermission(permissions: Permission[]) {
  return async (
    req: NextRequest,
    handler: (req: NextRequest, context: AuthContext) => Promise<NextResponse>
  ) => {
    const context = await getCanonicalAuthContext(req);
    if (!context) return unauthorized();
    if (!contextHasAnyPermission(context, permissions)) {
      return forbidden('Insufficient permissions');
    }
    return handler(req, context);
  };
}

export function requireRole(roles: string[]) {
  return async (
    req: NextRequest,
    handler: (req: NextRequest, context: AuthContext) => Promise<NextResponse>
  ) => {
    const context = await getCanonicalAuthContext(req);
    if (!context) return unauthorized();
    if (!contextHasRole(context, roles)) {
      return forbidden('Insufficient role');
    }
    return handler(req, context);
  };
}