// app/api/platform/organizations/[id]/org-units/route.ts
//
// Platform-scoped org-unit management: the endpoint whose absence had
// blocked branch management from the platform-admin UI for three rounds.
//
// `/api/tenancy/org-units` and `/api/security/org-units` both resolve the
// organization from the CALLER's session on GET and POST, so neither can
// serve another organization's tree. See
// PlatformController.listOrganizationOrgUnits for the full account of
// what pointing the UI at them would have rendered.
//
// Guarded TWICE, like every other platform route: withAuth here, and
// PlatformController.requirePlatformAdmin checking for the literal
// Role.SUPER_ADMIN inside. The second check is the load-bearing one --
// AuthContext.isSuperAdmin is also true for organization_owner, who is
// privileged only within their own tenant.
//
// GET requires PLATFORM_VIEW; POST requires PLATFORM_MANAGE. Creating a
// branch inside a customer's organization is a write across a tenant
// boundary, and it should not be reachable with a read-only platform
// permission.

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
    return platformController.listOrganizationOrgUnits(req, id);
  },
  { permission: Permission.PLATFORM_VIEW }
);

export const POST = withAuth<RouteParams>(
  async (req: NextRequest, _ctx, { params }) => {
    const { id } = await params;
    return platformController.createOrganizationOrgUnit(req, id);
  },
  { permission: Permission.PLATFORM_MANAGE }
);
