// app/api/organizations/[id]/ai-settings/route.ts

import { NextRequest } from 'next/server';
import { organizationAdvancedController } from '@/modules/organizations/controllers/organization-advanced.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

type Ctx = { params: Promise<{ id: string }> };

export const PUT = withAuth<Ctx>(
  async (req: NextRequest, _context, { params }) => {
    const { id } = await params;
    return organizationAdvancedController.updateAISettings(req, id);
  },
  { permission: Permission.ORG_SETTINGS }
);