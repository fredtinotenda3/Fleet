// app/api/tenancy/org-units/[id]/route.ts

import { NextRequest } from 'next/server';
import { orgUnitController } from '@/modules/security/controllers/org-unit.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

type Ctx = { params: Promise<{ id: string }> };

export const GET = withAuth<Ctx>(
  async (req: NextRequest, _context, { params }) => {
    const { id } = await params;
    return orgUnitController.getOrgUnit(req, id);
  },
  { permission: Permission.ORG_UNIT_VIEW }
);

export const PATCH = withAuth<Ctx>(
  async (req: NextRequest, _context, { params }) => {
    const { id } = await params;
    return orgUnitController.updateOrgUnit(req, id);
  },
  { permission: Permission.ORG_UNIT_MANAGE }
);

export const DELETE = withAuth<Ctx>(
  async (req: NextRequest, _context, { params }) => {
    const { id } = await params;
    return orgUnitController.deleteOrgUnit(req, id);
  },
  { permission: Permission.ORG_UNIT_MANAGE }
);