// server/middleware/tenant-isolation.ts

import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';

export async function enforceTenantIsolation(
  req: NextRequest,
  handler: (req: NextRequest, context: { userId: string; tenantId: string }) => Promise<NextResponse>
): Promise<NextResponse> {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  
  if (!token) {
    return APIResponse.unauthorized();
  }
  
  const tenantId = (token as any).tenantId;
  const userId = token.sub as string;
  
  // Extract tenant ID from request (path, header, or body)
  const requestTenantId = req.headers.get('x-tenant-id') || 
                          req.nextUrl.searchParams.get('tenantId') || 
                          (await req.clone().json().catch(() => ({}))).tenantId;
  
  // Verify tenant match
  if (requestTenantId && requestTenantId !== tenantId) {
    await auditLog.logAction('TENANT_ISOLATION_VIOLATION', userId, tenantId, {
      requestedTenantId: requestTenantId,
      path: req.nextUrl.pathname,
      method: req.method,
    });
    
    return APIResponse.forbidden('Tenant access violation');
  }
  
  // Add tenant context to request for downstream use
  (req as any).tenantId = tenantId;
  (req as any).userId = userId;
  
  return handler(req, { userId, tenantId });
}