// app/api/finance/depreciation/profiles/route.ts

import { NextRequest } from 'next/server';
import { depreciationController } from '@/modules/finance/controllers/depreciation.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const dynamic = 'force-dynamic';

export const GET = withAuth(
  (req: NextRequest) => depreciationController.listProfiles(req),
  { permission: Permission.FINANCE_VIEW }
);

export const POST = withAuth(
  (req: NextRequest) => depreciationController.upsertProfile(req),
  { permission: Permission.FINANCE_MANAGE }
);
