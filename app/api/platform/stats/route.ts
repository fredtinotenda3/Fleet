// app/api/platform/stats/route.ts
//
// FIX (🔴 Critical — no auth of any kind): same class of bug as the
// other platform/** routes. Platform-wide aggregate stats (organization
// counts, usage, etc. across every tenant) were readable by anyone.
// withAuth + Permission.PLATFORM_VIEW closes this.

import { NextRequest } from 'next/server';
import { platformController } from '@/modules/tenancy/controllers/platform.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth(
  (req: NextRequest) => platformController.getStats(req),
  { permission: Permission.PLATFORM_VIEW }
);