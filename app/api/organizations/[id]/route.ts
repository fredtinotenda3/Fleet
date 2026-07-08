// app/api/organizations/[id]/route.ts

import { NextRequest } from 'next/server';
import { organizationController } from '@/modules/organizations/controllers/organization.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

type Ctx = { params: Promise<{ id: string }> };

export const GET = withAuth<Ctx>(
  async (req: NextRequest, _context, { params }) => {
    const { id } = await params;
    return organizationController.getOrganization(req, id);
  },
  { permission: Permission.ORG_VIEW }
);

export const PATCH = withAuth<Ctx>(
  async (req: NextRequest, _context, { params }) => {
    const { id } = await params;
    return organizationController.updateOrganization(req, id);
  },
  { permission: Permission.ORG_SETTINGS }
);