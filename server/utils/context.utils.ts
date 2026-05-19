// C:\Users\user\Desktop\Fleet\server\utils\context.utils.ts

import { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { UnauthorizedError } from '@/server/errors/app.errors';

export async function getTenantFromRequest(req: NextRequest): Promise<string> {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  
  if (!token) {
    throw new UnauthorizedError('No authentication token found');
  }
  
  // Get tenantId from token
  let tenantId = (token as any).tenantId || 'default';
  
  // Check if user has super_admin role - they get 'default' tenant which sees all
  const roles = (token as any).roles || [];
  const isSuperAdmin = roles.includes('super_admin') || roles.includes('organization_owner');
  
  // Super admins use 'default' tenant to bypass filtering
  if (isSuperAdmin) {
    tenantId = 'default';
  }
  
  console.log(`🔐 getTenantFromRequest - userId: ${token.sub}, tenantId: ${tenantId}, isSuperAdmin: ${isSuperAdmin}`);
  
  return tenantId;
}

export async function getUserIdFromRequest(req: NextRequest): Promise<string> {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  
  if (!token) {
    throw new UnauthorizedError('No authentication token found');
  }
  
  return (token as any).sub || (token as any).id;
}

export async function getUserRolesFromRequest(req: NextRequest): Promise<string[]> {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  
  if (!token) {
    throw new UnauthorizedError('No authentication token found');
  }
  
  return (token as any).roles || ['user'];
}

export async function isSuperAdmin(req: NextRequest): Promise<boolean> {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) return false;
  const roles = (token as any).roles || [];
  return roles.includes('super_admin') || roles.includes('organization_owner');
}