// app/api/security/sso/connections/route.ts

import { NextRequest } from 'next/server';
import { ssoController } from '@/modules/security/controllers/sso.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth((req: NextRequest) => ssoController.list(req), {
  permission: Permission.SSO_CONNECTION_VIEW,
});

export const POST = withAuth((req: NextRequest) => ssoController.create(req), {
  permission: Permission.SSO_CONNECTION_MANAGE,
});