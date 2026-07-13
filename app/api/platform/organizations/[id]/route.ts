// app/api/platform/organizations/[id]/route.ts
//
// FIX (🔴 Critical — no auth of any kind): same class of bug as
// app/api/platform/organizations/route.ts. Any unauthenticated caller
// could read the full detail record of any organization on the
// platform by ID. withAuth + Permission.PLATFORM_VIEW closes this.

import { NextRequest } from 'next/server';
import { platformController } from '@/modules/tenancy/controllers/platform.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const GET = withAuth<RouteParams>(
  async (req: NextRequest, _ctx, { params }) => {
    const { id } = await params;
    return platformController.getOrganization(req, id);
  },
  { permission: Permission.PLATFORM_VIEW }
);