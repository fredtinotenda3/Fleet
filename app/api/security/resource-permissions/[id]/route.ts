// app/api/security/resource-permissions/[id]/route.ts

import { NextRequest } from 'next/server';
import { resourcePermissionController } from '@/modules/security/controllers/resource-permission.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const GET = withAuth<RouteParams>(
  async (req: NextRequest, _ctx, { params }) => {
    const { id } = await params;
    return resourcePermissionController.get(req, id);
  },
  { permission: Permission.RESOURCE_PERMISSION_VIEW }
);

export const DELETE = withAuth<RouteParams>(
  async (req: NextRequest, _ctx, { params }) => {
    const { id } = await params;
    return resourcePermissionController.revoke(req, id);
  },
  { permission: Permission.RESOURCE_PERMISSION_MANAGE }
);