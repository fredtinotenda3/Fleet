// app/api/security/sso/connections/[id]/route.ts

import { NextRequest } from 'next/server';
import { ssoController } from '@/modules/security/controllers/sso.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const GET = withAuth<RouteParams>(
  async (req: NextRequest, _ctx, { params }) => {
    const { id } = await params;
    return ssoController.get(req, id);
  },
  { permission: Permission.SSO_CONNECTION_VIEW }
);

export const PUT = withAuth<RouteParams>(
  async (req: NextRequest, _ctx, { params }) => {
    const { id } = await params;
    return ssoController.update(req, id);
  },
  { permission: Permission.SSO_CONNECTION_MANAGE }
);

export const DELETE = withAuth<RouteParams>(
  async (req: NextRequest, _ctx, { params }) => {
    const { id } = await params;
    return ssoController.delete(req, id);
  },
  { permission: Permission.SSO_CONNECTION_MANAGE }
);