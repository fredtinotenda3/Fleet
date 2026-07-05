// app/api/oauth/clients/[id]/route.ts

import { NextRequest } from 'next/server';
import { oauthClientController } from '@/modules/oauth/controllers/oauth-client.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const GET = withAuth<RouteParams>(
  async (req: NextRequest, _ctx, { params }) => {
    const { id } = await params;
    return oauthClientController.getClient(req, id);
  },
  { permission: Permission.API_KEY_VIEW }
);

export const PUT = withAuth<RouteParams>(
  async (req: NextRequest, _ctx, { params }) => {
    const { id } = await params;
    return oauthClientController.updateClient(req, id);
  },
  { permission: Permission.API_KEY_MANAGE }
);

export const DELETE = withAuth<RouteParams>(
  async (req: NextRequest, _ctx, { params }) => {
    const { id } = await params;
    return oauthClientController.deleteClient(req, id);
  },
  { permission: Permission.API_KEY_MANAGE }
);