// app/api/security/org-units/[id]/route.ts

import { NextRequest } from 'next/server';
import { orgUnitController } from '@/modules/security/controllers/org-unit.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const GET = withAuth<RouteParams>(
  async (req: NextRequest, _ctx, { params }) => {
    const { id } = await params;
    return orgUnitController.getOrgUnit(req, id);
  },
  { permission: Permission.ORG_UNIT_VIEW }
);

export const PUT = withAuth<RouteParams>(
  async (req: NextRequest, _ctx, { params }) => {
    const { id } = await params;
    return orgUnitController.updateOrgUnit(req, id);
  },
  { permission: Permission.ORG_UNIT_MANAGE }
);

export const DELETE = withAuth<RouteParams>(
  async (req: NextRequest, _ctx, { params }) => {
    const { id } = await params;
    return orgUnitController.deleteOrgUnit(req, id);
  },
  { permission: Permission.ORG_UNIT_MANAGE }
);