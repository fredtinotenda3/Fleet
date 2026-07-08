// app/api/organizations/[id]/members/invite/route.ts

import { NextRequest } from 'next/server';
import { organizationController } from '@/modules/organizations/controllers/organization.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

type Ctx = { params: Promise<{ id: string }> };

export const POST = withAuth<Ctx>(
  async (req: NextRequest, _context, { params }) => {
    const { id } = await params;
    return organizationController.inviteMember(req, id);
  },
  { permission: Permission.ORG_MEMBERS_MANAGE }
);

export const DELETE = withAuth<Ctx>(
  async (req: NextRequest, _context, { params }) => {
    const { id } = await params;
    return organizationController.revokeInvite(req, id);
  },
  { permission: Permission.ORG_MEMBERS_MANAGE }
);