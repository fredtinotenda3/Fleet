// server/utils/context.utils.ts

import { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { UnauthorizedError } from '@/server/errors/app.errors';

export async function getTenantFromRequest(req: NextRequest): Promise<string> {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  if (!token) {
    throw new UnauthorizedError('No authentication token found');
  }

  const roles: string[] = (token as any).roles || [];
  const isSuperAdminUser =
    roles.includes('super_admin') || roles.includes('organization_owner');

  // Super admins bypass tenant filtering
  if (isSuperAdminUser) {
    return 'default';
  }

  const tenantId = (token as any).tenantId || 'default';
  return tenantId;
}

export async function getUserIdFromRequest(req: NextRequest): Promise<string> {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  if (!token) {
    throw new UnauthorizedError('No authentication token found');
  }

  return ((token as any).sub || (token as any).id) as string;
}

export async function getUserRolesFromRequest(
  req: NextRequest
): Promise<string[]> {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  if (!token) {
    throw new UnauthorizedError('No authentication token found');
  }

  return (token as any).roles || ['user'];
}

export async function isSuperAdmin(req: NextRequest): Promise<boolean> {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) return false;
  const roles: string[] = (token as any).roles || [];
  return roles.includes('super_admin') || roles.includes('organization_owner');
}