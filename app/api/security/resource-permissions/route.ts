// app/api/security/resource-permissions/route.ts

import { NextRequest } from 'next/server';
import { resourcePermissionController } from '@/modules/security/controllers/resource-permission.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth(
  (req: NextRequest) => resourcePermissionController.list(req),
  { permission: Permission.RESOURCE_PERMISSION_VIEW }
);

export const POST = withAuth(
  (req: NextRequest) => resourcePermissionController.grant(req),
  { permission: Permission.RESOURCE_PERMISSION_MANAGE }
);