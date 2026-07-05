// app/api/security/scope-assignments/route.ts

import { NextRequest } from 'next/server';
import { userScopeController } from '@/modules/security/controllers/user-scope.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth(
  (req: NextRequest) => userScopeController.listForUser(req),
  { permission: Permission.SCOPE_ASSIGNMENT_VIEW }
);

export const POST = withAuth(
  (req: NextRequest) => userScopeController.assign(req),
  { permission: Permission.SCOPE_ASSIGNMENT_MANAGE }
);