// app/api/organizations/[id]/members/route.ts

import { NextRequest } from 'next/server';
import { organizationController } from '@/modules/organizations/controllers/organization.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const POST = withAuth(
  async (req: NextRequest, _ctx, { params }: RouteParams = { params: Promise.resolve({ id: '' }) } as any) => {
    const { id } = await params;
    return organizationController.inviteMember(req, id);
  },
  { permission: Permission.ORG_MEMBERS_MANAGE }
);

export const DELETE = withAuth(
  async (req: NextRequest, _ctx, { params }: RouteParams = { params: Promise.resolve({ id: '' }) } as any) => {
    const { id } = await params;
    return organizationController.revokeInvite(req, id);
  },
  { permission: Permission.ORG_MEMBERS_MANAGE }
);