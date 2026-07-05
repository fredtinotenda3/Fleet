// server/middleware/tenant-isolation.ts

import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';

export async function enforceTenantIsolation(
  req: NextRequest,
  handler: (
    req: NextRequest,
    context: { userId: string; tenantId: string }
  ) => Promise<NextResponse>
): Promise<NextResponse> {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  if (!token) {
    return NextResponse.json(
      {
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      },
      { status: 401 }
    );
  }

  const roles: string[] = (token as any).roles || [];
  const isSuperAdminUser =
    roles.includes('super_admin') || roles.includes('organization_owner');

  const tokenTenantId = (token as any).tenantId || 'default';
  const tenantId = isSuperAdminUser ? 'default' : tokenTenantId;
  const userId = token.sub as string;

  // Check if requestor is trying to access a different tenant
  const requestTenantId =
    req.headers.get('x-tenant-id') ||
    req.nextUrl.searchParams.get('tenantId');

  if (
    requestTenantId &&
    requestTenantId !== tenantId &&
    !isSuperAdminUser
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

  return handler(req, { userId, tenantId });
}