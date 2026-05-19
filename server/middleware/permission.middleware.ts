// server/middleware/permission.middleware.ts

import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { Permission, permissionService } from '@/server/permissions/roles';
import { auditLog } from '@/infrastructure/monitoring/audit.logger';

export interface AuthContext {
  userId: string;
  tenantId: string;
  roles: string[];
  permissions: Permission[];
}

export async function getAuthContext(req: NextRequest): Promise<AuthContext | null> {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  
  if (!token) {
    return null;
  }
  
  const roles = (token as any).roles || ['viewer'];
  const permissions = roles.flatMap((role: string) => 
    permissionService.getPermissionsForRole(role as any)
  );
  
  return {
    userId: token.sub as string,
    tenantId: (token as any).tenantId || 'default',
    roles,
    permissions: [...new Set(permissions)],
  };
}

export function requirePermission(permission: Permission) {
  return async (req: NextRequest, handler: (req: NextRequest, context: AuthContext) => Promise<NextResponse>) => {
    const context = await getAuthContext(req);
    
    if (!context) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
        { status: 401 }
      );
    }
    
    if (!context.permissions.includes(permission)) {
      await auditLog.logAction('PERMISSION_DENIED', context.userId, context.tenantId, {
        requiredPermission: permission,
        path: req.nextUrl.pathname,
        method: req.method,
      });
      
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } },
        { status: 403 }
      );
    }
    
    return handler(req, context);
  };
}

export function requireAnyPermission(permissions: Permission[]) {
  return async (req: NextRequest, handler: (req: NextRequest, context: AuthContext) => Promise<NextResponse>) => {
    const context = await getAuthContext(req);
    
    if (!context) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
        { status: 401 }
      );
    }
    
    const hasPermission = permissions.some(p => context.permissions.includes(p));
    
    if (!hasPermission) {
      await auditLog.logAction('PERMISSION_DENIED', context.userId, context.tenantId, {
        requiredPermissions: permissions,
        path: req.nextUrl.pathname,
        method: req.method,
      });
      
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } },
        { status: 403 }
      );
    }
    
    return handler(req, context);
  };
}

export function requireRole(roles: string[]) {
  return async (req: NextRequest, handler: (req: NextRequest, context: AuthContext) => Promise<NextResponse>) => {
    const context = await getAuthContext(req);
    
    if (!context) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
        { status: 401 }
      );
    }
    
    const hasRole = context.roles.some(role => roles.includes(role));
    
    if (!hasRole) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Insufficient role' } },
        { status: 403 }
      );
    }
    
    return handler(req, context);
  };
}