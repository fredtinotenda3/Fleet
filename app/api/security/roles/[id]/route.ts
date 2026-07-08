// app/api/security/roles/[id]/route.ts

import { NextRequest } from 'next/server';
import { roleController } from '@/modules/security/controllers/role.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

type Ctx = { params: Promise<{ id: string }> };

export const GET = withAuth<Ctx>(
  async (req: NextRequest, _context, { params }) => {
    const { id } = await params;
    return roleController.getRole(req, id);
  },
  { permission: Permission.CUSTOM_ROLE_VIEW }
);

export const PATCH = withAuth<Ctx>(
  async (req: NextRequest, _context, { params }) => {
    const { id } = await params;
    return roleController.updateRole(req, id);
  },
  { permission: Permission.CUSTOM_ROLE_MANAGE }
);

export const DELETE = withAuth<Ctx>(
  async (req: NextRequest, _context, { params }) => {
    const { id } = await params;
    return roleController.deleteRole(req, id);
  },
  { permission: Permission.CUSTOM_ROLE_MANAGE }
);