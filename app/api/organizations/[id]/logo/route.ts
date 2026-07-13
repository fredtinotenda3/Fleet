// app/api/organizations/[id]/logo/route.ts
//
// FIX (Medium — silently no-op rate limit): this passed
// `rateLimit: {...} as any` into withAuth's options. No other withAuth
// call site in the codebase uses a rateLimit option, and the `as any`
// cast is the tell — TypeScript was rejecting it because withAuth's
// options type doesn't have one, meaning it was never enforced. The
// codebase's real rate-limiting utility (infrastructure/security/
// rate-limit.ts, `rateLimiter.checkLimit()`) is called directly inside
// route handlers elsewhere (e.g. app/api/auth/sso/discover/route.ts).
// Switched to that pattern.

import { NextRequest, NextResponse } from 'next/server';
import { organizationController } from '@/modules/organizations/controllers/organization.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';
import { rateLimiter } from '@/infrastructure/security/rate-limit';

type Ctx = { params: Promise<{ id: string }> };

export const POST = withAuth<Ctx>(
  async (req: NextRequest, _context, { params }) => {
    const { allowed } = rateLimiter.checkLimit(req, { windowMs: 60_000, maxRequests: 10 });
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const { id } = await params;
    return organizationController.updateLogo(req, id);
  },
  { permission: Permission.ORG_SETTINGS }
);