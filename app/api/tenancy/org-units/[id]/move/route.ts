// app/api/tenancy/org-units/[id]/move/route.ts

import { NextRequest } from 'next/server';
import { tenancyController } from '@/modules/tenancy/controllers/tenancy.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const PUT = withAuth<RouteParams>(
  async (req: NextRequest, _ctx, { params }) => {
    const { id } = await params;
    return tenancyController.moveOrgUnit(req, id);
  },
  { permission: Permission.ORG_UNIT_MANAGE }
);