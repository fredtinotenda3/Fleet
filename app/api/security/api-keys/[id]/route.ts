// app/api/security/api-keys/[id]/route.ts

import { NextRequest } from 'next/server';
import { apiKeyController } from '@/modules/security/controllers/api-key.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const GET = withAuth<RouteParams>(
  async (req: NextRequest, context, { params }) => {
    const { id } = await params;
    return apiKeyController.get(req, context, id);
  },
  { permission: Permission.API_KEY_VIEW }
);

export const DELETE = withAuth<RouteParams>(
  async (req: NextRequest, context, { params }) => {
    const { id } = await params;
    return apiKeyController.revoke(req, context, id);
  },
  { permission: Permission.API_KEY_MANAGE }
);