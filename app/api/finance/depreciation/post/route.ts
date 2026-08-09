// app/api/finance/depreciation/post/route.ts
//
// POST with ?preview=true computes without writing. Both are gated on
// FINANCE_MANAGE rather than splitting preview onto FINANCE_VIEW: a
// preview reveals the vehicle's acquisition cost and book value, which
// is the same financially sensitive policy data the profile endpoint
// protects.

import { NextRequest } from 'next/server';
import { depreciationController } from '@/modules/finance/controllers/depreciation.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const dynamic = 'force-dynamic';

export const POST = withAuth(
  (req: NextRequest) => depreciationController.postCharge(req),
  { permission: Permission.FINANCE_MANAGE }
);
