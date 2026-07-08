// app/api/tenancy/org-units/[id]/move/route.ts

import { NextRequest } from 'next/server';
import { tenancyController } from '@/modules/tenancy/controllers/tenancy.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = withAuth<Ctx>(
  async (req: NextRequest, _context, { params }) => {
    const { id } = await params;
    return tenancyController.moveOrgUnit(req, id);
  },
  { permission: Permission.ORG_UNIT_MOVE }
);