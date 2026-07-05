// app/api/security/scope-assignments/[id]/route.ts

import { NextRequest } from 'next/server';
import { userScopeController } from '@/modules/security/controllers/user-scope.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const DELETE = withAuth<RouteParams>(
  async (req: NextRequest, _ctx, { params }) => {
    const { id } = await params;
    return userScopeController.revoke(req, id);
  },
  { permission: Permission.SCOPE_ASSIGNMENT_MANAGE }
);