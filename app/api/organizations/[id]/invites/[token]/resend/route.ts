// app/api/organizations/[id]/invites/[token]/resend/route.ts

import { NextRequest } from 'next/server';
import { organizationController } from '@/modules/organizations/controllers/organization.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

type Ctx = { params: Promise<{ id: string; token: string }> };

export const POST = withAuth<Ctx>(
  async (req: NextRequest, _context, { params }) => {
    const { id, token } = await params;
    return organizationController.resendInvite(req, id, token);
  },
  { permission: Permission.ORG_MEMBERS_MANAGE }
);