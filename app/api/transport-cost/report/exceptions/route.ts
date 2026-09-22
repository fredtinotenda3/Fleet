// app/api/transport-cost/report/exceptions/route.ts
//
// Item 6 (data-quality exceptions export). Same VIEW-gate as
// app/api/transport-cost/report/route.ts -- reading this evidence does
// not require the accounting authority that posting does.

import { NextRequest } from 'next/server';
import { transportCostController } from '@/modules/transport-cost/controllers/transport-cost.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth(
  async (req: NextRequest) => transportCostController.getDataQualityExceptions(req),
  { permission: Permission.TRANSPORT_COST_VIEW }
);
