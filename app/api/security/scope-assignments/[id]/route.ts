// app/api/security/scope-assignments/[id]/route.ts

import { NextRequest } from 'next/server';
import { userScopeController } from '@/modules/security/controllers/user-scope.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = withAuth<Ctx>(
  async (req: NextRequest, _context, { params }) => {
    const { id } = await params;
    return userScopeController.revoke(req, id);
  },
  { permission: Permission.SCOPE_ASSIGNMENT_MANAGE }
);