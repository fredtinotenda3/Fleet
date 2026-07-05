// infrastructure/security/middleware.ts

import { NextRequest, NextResponse } from 'next/server';
import { rateLimiter } from './rate-limit';
import { sanitization } from './sanitization';
import { Permission, permissionService } from './permissions';
import { getToken } from 'next-auth/jwt';

export interface SecurityContext {
  userId: string;
  tenantId: string;
  roles: string[];
  permissions: Permission[];
}

export async function securityMiddleware(
  req: NextRequest
): Promise<SecurityContext | NextResponse> {
  const { allowed } = rateLimiter.checkLimit(req);
  if (!allowed) {
    return NextResponse.json(
      { error: { code: 'RATE_LIMITED', message: 'Too many requests' } },
      { status: 429 }
    );
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
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

  const roles: string[] = (token as any).roles || ['viewer'];
  const isSuperAdminUser =
    roles.includes('super_admin') || roles.includes('organization_owner');
  const tenantId = isSuperAdminUser
    ? 'default'
    : (token as any).tenantId || 'default';

  return {
    userId: token.sub as string,
    tenantId,
    roles,
    permissions: [],
  };
}

export async function requirePermission(
  req: NextRequest,
  requiredPermission: Permission
): Promise<SecurityContext | NextResponse> {
  const context = await securityMiddleware(req);
  if (context instanceof NextResponse) return context;

  const hasPermission = permissionService.hasPermission(
    context.roles,
    requiredPermission
  );
  if (!hasPermission) {
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