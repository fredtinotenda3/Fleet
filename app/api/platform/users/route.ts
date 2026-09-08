// app/api/platform/users/route.ts
//
// Every user account across every organization. Redacted in platform-directory.service.ts.
//
// Guarded TWICE, deliberately: withAuth(PLATFORM_VIEW) here, and
// PlatformController.requirePlatformAdmin checking for the literal
// Role.SUPER_ADMIN inside. The second check is the load-bearing one --
// AuthContext.isSuperAdmin is also true for organization_owner, who is
// privileged only within their own tenant and must never read across
// every customer.

import { NextRequest } from 'next/server';
import { platformController } from '@/modules/tenancy/controllers/platform.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth(
  (req: NextRequest) => platformController.listUsers(req),
  { permission: Permission.PLATFORM_VIEW }
);
