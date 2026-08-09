// app/api/finance/cost-per-km/route.ts

import { NextRequest } from 'next/server';
import { allocationController } from '@/modules/finance/controllers/allocation.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const dynamic = 'force-dynamic';

export const GET = withAuth(
  (req: NextRequest) => allocationController.getCostPerKm(req),
  { permission: Permission.FINANCE_VIEW }
);
