// app/api/organizations/[id]/analytics/route.ts

import { NextRequest } from 'next/server';
import { organizationAdvancedController } from '@/modules/organizations/controllers/organization-advanced.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

type Ctx = { params: Promise<{ id: string }> };

export const GET = withAuth<Ctx>(
  async (req: NextRequest, _context, { params }) => {
    const { id } = await params;
    return organizationAdvancedController.getActivitySummary(req, id);
  },
  { permission: Permission.ORG_VIEW }
);