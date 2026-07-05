// app/api/security/roles/route.ts

import { NextRequest } from 'next/server';
import { roleController } from '@/modules/security/controllers/role.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth(
  (req: NextRequest) => roleController.listRoles(req),
  { permission: Permission.CUSTOM_ROLE_VIEW }
);

export const POST = withAuth(
  (req: NextRequest) => roleController.createRole(req),
  { permission: Permission.CUSTOM_ROLE_MANAGE }
);