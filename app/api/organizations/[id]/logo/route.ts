// app/api/organizations/[id]/logo/route.ts

import { NextRequest } from 'next/server';
import { organizationController } from '@/modules/organizations/controllers/organization.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

type Ctx = { params: Promise<{ id: string }> };

export const POST = withAuth<Ctx>(
  async (req: NextRequest, _context, { params }) => {
    const { id } = await params;
    return organizationController.updateLogo(req, id);
  },
  { permission: Permission.ORG_SETTINGS, rateLimit: { windowMs: 60_000, max: 10 } as any }
);