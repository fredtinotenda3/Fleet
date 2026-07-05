// app/api/providers/[id]/route.ts

import { NextRequest } from 'next/server';
import { externalProviderController } from '@/modules/oauth/controllers/external-provider.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const GET = withAuth<RouteParams>(
  async (req: NextRequest, _ctx, { params }) => {
    const { id } = await params;
    return externalProviderController.getProvider(req, id);
  },
  { permission: Permission.SSO_CONNECTION_VIEW }
);

export const PUT = withAuth<RouteParams>(
  async (req: NextRequest, _ctx, { params }) => {
    const { id } = await params;
    return externalProviderController.updateProvider(req, id);
  },
  { permission: Permission.SSO_CONNECTION_MANAGE }
);

export const DELETE = withAuth<RouteParams>(
  async (req: NextRequest, _ctx, { params }) => {
    const { id } = await params;
    return externalProviderController.deleteProvider(req, id);
  },
  { permission: Permission.SSO_CONNECTION_MANAGE }
);