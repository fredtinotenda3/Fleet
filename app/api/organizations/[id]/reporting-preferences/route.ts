// app/api/organizations/[id]/reporting-preferences/route.ts

import { NextRequest } from 'next/server';
import { organizationAdvancedController } from '@/modules/organizations/controllers/organization-advanced.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

type Ctx = { params: Promise<{ id: string }> };

export const PUT = withAuth<Ctx>(
  async (req: NextRequest, _context, { params }) => {
    const { id } = await params;
    return organizationAdvancedController.updateReportingPreferences(req, id);
  },
  { permission: Permission.ORG_SETTINGS }
);