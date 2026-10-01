// app/api/organizations/[id]/members/[memberId]/suspend/route.ts

import { NextRequest } from 'next/server';
import { organizationController } from '@/modules/organizations/controllers/organization.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

type Ctx = { params: Promise<{ id: string; memberId: string }> };

export const POST = withAuth<Ctx>(
  async (req: NextRequest, _context, { params }) => {
    const { id, memberId } = await params;
    return organizationController.suspendMember(req, id, memberId);
  },
  { permission: Permission.ORG_MEMBERS_MANAGE }
);