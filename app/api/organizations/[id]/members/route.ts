// app/api/organizations/[id]/members/route.ts
//
// POST here = "add member directly" (creates a login-ready account
// immediately). This is distinct from
// app/api/organizations/[id]/members/invite/route.ts (email invite flow) —
// see modules/organizations/services/organization.service.ts's
// addMemberDirect() vs addMember() for the behavioral difference.

import { NextRequest } from 'next/server';
import { organizationController } from '@/modules/organizations/controllers/organization.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

type Ctx = { params: Promise<{ id: string }> };

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const POST = withAuth<Ctx>(
  async (req: NextRequest, _context, { params }) => {
    const { id } = await params;
    return organizationController.addMemberDirect(req, id);
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