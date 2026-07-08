// app/api/security/permissions/route.ts

import { NextRequest } from 'next/server';
import { roleController } from '@/modules/security/controllers/role.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth(
  (req: NextRequest) => roleController.listPermissionDefinitions(req),
  { permission: Permission.CUSTOM_ROLE_VIEW }
);