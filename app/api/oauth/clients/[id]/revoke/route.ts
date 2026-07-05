// app/api/oauth/clients/[id]/revoke/route.ts

import { NextRequest } from 'next/server';
import { oauthClientController } from '@/modules/oauth/controllers/oauth-client.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const POST = withAuth<RouteParams>(
  async (req: NextRequest, _ctx, { params }) => {
    const { id } = await params;
    return oauthClientController.revokeClient(req, id);
  },
  { permission: Permission.API_KEY_MANAGE }
);