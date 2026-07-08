// app/api/organizations/[id]/statistics/route.ts

import { NextRequest } from 'next/server';
import { organizationController } from '@/modules/organizations/controllers/organization.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

type Ctx = { params: Promise<{ id: string }> };

export const GET = withAuth<Ctx>(
  async (req: NextRequest, _context, { params }) => {
    const { id } = await params;
    return organizationController.getStatistics(req, id);
  },
  { permission: Permission.ORG_VIEW }
);