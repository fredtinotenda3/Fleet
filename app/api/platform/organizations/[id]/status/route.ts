// app/api/platform/organizations/[id]/status/route.ts
//
// FIX (🔴 Critical — no auth of any kind): this was the worst of the
// three platform/organizations routes — a WRITE endpoint with zero
// auth. Any unauthenticated caller could suspend, reactivate, or
// otherwise change the status of any organization on the platform by
// ID. withAuth + Permission.PLATFORM_MANAGE closes this.

import { NextRequest } from 'next/server';
import { platformController } from '@/modules/tenancy/controllers/platform.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const PUT = withAuth<RouteParams>(
  async (req: NextRequest, _ctx, { params }) => {
    const { id } = await params;
    return platformController.setOrganizationStatus(req, id);
  },
  { permission: Permission.PLATFORM_MANAGE }
);