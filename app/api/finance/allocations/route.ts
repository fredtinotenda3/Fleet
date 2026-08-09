// app/api/finance/allocations/route.ts

import { NextRequest } from 'next/server';
import { allocationController } from '@/modules/finance/controllers/allocation.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const dynamic = 'force-dynamic';

export const GET = withAuth(
  (req: NextRequest) => allocationController.listPostings(req),
  { permission: Permission.FINANCE_VIEW }
);

export const POST = withAuth(
  (req: NextRequest) => allocationController.createPosting(req),
  { permission: Permission.FINANCE_MANAGE }
);
