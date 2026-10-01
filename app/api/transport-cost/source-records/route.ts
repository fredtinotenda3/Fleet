// app/api/transport-cost/source-records/route.ts

import { NextRequest } from 'next/server';
import { transportCostController } from '@/modules/transport-cost/controllers/transport-cost.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth(
  async (req: NextRequest) => transportCostController.getSourceRecords(req),
  { permission: Permission.TRANSPORT_COST_VIEW }
);
