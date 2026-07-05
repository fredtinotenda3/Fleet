// app/api/security/roles/[id]/route.ts

import { NextRequest } from 'next/server';
import { roleController } from '@/modules/security/controllers/role.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const GET = withAuth<RouteParams>(
  async (req: NextRequest, _ctx, { params }) => {
    const { id } = await params;
    return roleController.getRole(req, id);
  },
  { permission: Permission.CUSTOM_ROLE_VIEW }
);

export const PUT = withAuth<RouteParams>(
  async (req: NextRequest, _ctx, { params }) => {
    const { id } = await params;
    return roleController.updateRole(req, id);
  },
  { permission: Permission.CUSTOM_ROLE_MANAGE }
);

export const DELETE = withAuth<RouteParams>(
  async (req: NextRequest, _ctx, { params }) => {
    const { id } = await params;
    return roleController.deleteRole(req, id);
  },
  { permission: Permission.CUSTOM_ROLE_MANAGE }
);