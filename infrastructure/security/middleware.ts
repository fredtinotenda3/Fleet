// infrastructure/security/middleware.ts
//
// FIX (critical -- middleware consistency / session-revocation bypass):
// this file used to define its own securityMiddleware() that parsed the
// NextAuth JWT directly via getToken(), completely independently of the
// canonical getAuthContext() in server/auth/auth-context.ts. That meant
// any route built on withSecurity()/withPermission() from this file:
//   1. Never checked session revocation -- a force-logged-out or
//      admin-revoked session's JWT kept authenticating here forever,
//      identical to the bug already fixed in
//      server/middleware/permission.middleware.ts and
//      server/middleware/tenant-isolation.ts.
//   2. Never supported API-key authentication.
//   3. Always returned permissions: [] on the context, regardless of
//      the user's actual role -- requirePermission() worked around
//      this by re-deriving permissions from roles internally, but any
//      other caller reading context.permissions got nothing.
// This is now a thin wrapper around the single canonical
// getAuthContext(), so every route gets identical authentication
// behavior regardless of which of these three near-identical helper
// files it happens to import.
//
// Prefer server/middleware/with-auth.ts (withAuth) for new routes -- it
// additionally gives rate limiting, API-version headers, and request
// tracing/metrics for free. This file remains only for routes not yet
// migrated to withAuth().

import { NextRequest, NextResponse } from 'next/server';
import { Permission } from './permissions';
import {
  getAuthContext as getCanonicalAuthContext,
  hasPermission as contextHasPermission,
} from '@/server/auth/auth-context';

export interface SecurityContext {
  userId: string;
  tenantId: string;
  roles: string[];
  permissions: Permission[];
  isSuperAdmin?: boolean;
  sessionId?: string;
  isApiKey?: boolean;
}

export async function securityMiddleware(
  req: NextRequest
): Promise<SecurityContext | NextResponse> {
  const context = await getCanonicalAuthContext(req);

  if (!context) {
    return NextResponse.json(
      {
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      },
      { status: 401 }
    );
  }

  return {
    userId: context.userId,
    tenantId: context.tenantId,
    roles: context.roles,
    permissions: context.permissions,
    isSuperAdmin: context.isSuperAdmin,
    sessionId: context.sessionId,
    isApiKey: context.isApiKey,
  };
}

export async function requirePermission(
  req: NextRequest,
  requiredPermission: Permission
): Promise<SecurityContext | NextResponse> {
  const context = await securityMiddleware(req);
  if (context instanceof NextResponse) return context;

  const allowed =
    context.isSuperAdmin || context.permissions.includes(requiredPermission);
  if (!allowed) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } },
      { status: 403 }
    );
  }

  return context;
}

export function withSecurity(
  handler: (
    req: NextRequest,
    context: SecurityContext
  ) => Promise<NextResponse>
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    const context = await securityMiddleware(req);
    if (context instanceof NextResponse) return context;
    return handler(req, context);
  };
}

export function withPermission(permission: Permission) {
  return (
    handler: (
      req: NextRequest,
      context: SecurityContext
    ) => Promise<NextResponse>
  ) =>
    async (req: NextRequest): Promise<NextResponse> => {
      const context = await requirePermission(req, permission);
      if (context instanceof NextResponse) return context;
      return handler(req, context);
    };
}

// Re-export so existing `import { hasPermission } from
// '@/infrastructure/security/middleware'` call sites (if any) keep
// resolving, now backed by the canonical implementation instead of a
// second copy of the same logic.
export const hasPermission = contextHasPermission;