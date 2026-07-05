// app/api/security/org-units/[id]/assignments/route.ts

import { NextRequest } from 'next/server';
import { userScopeController } from '@/modules/security/controllers/user-scope.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const GET = withAuth<RouteParams>(
  async (req: NextRequest, _ctx, { params }) => {
    const { id } = await params;
    return userScopeController.listForOrgUnit(req, id);
  },
  { permission: Permission.SCOPE_ASSIGNMENT_VIEW }
);