// app/api/transport-cost/report/months/route.ts
//
// Phase O4. The report screen's month-picker data source.

import { NextRequest } from 'next/server';
import { transportCostController } from '@/modules/transport-cost/controllers/transport-cost.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth(
  async (req: NextRequest) => transportCostController.getAvailableMonths(req),
  { permission: Permission.TRANSPORT_COST_VIEW }
);
