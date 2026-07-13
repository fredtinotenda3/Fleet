// app/api/platform/organizations/route.ts
//
// FIX (🔴 Critical — no auth of any kind on the platform surface): this
// route had zero authentication or authorization. Any unauthenticated
// caller could list every organization on the entire platform — the
// most sensitive, most cross-tenant endpoint in the app, gated
// everywhere else (see Permission.PLATFORM_VIEW's own comment in
// server/permissions/roles.ts: "restricted to SUPER_ADMIN only").
// withAuth + Permission.PLATFORM_VIEW closes this.

import { NextRequest } from 'next/server';
import { platformController } from '@/modules/tenancy/controllers/platform.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth(
  (req: NextRequest) => platformController.listOrganizations(req),
  { permission: Permission.PLATFORM_VIEW }
);