// app/api/transport-cost/postings/route.ts
//
// Phase O3. Same permission as posting a fuel/expense allocation -- see
// Permission.FINANCE_MANAGE's own doc comment for why this reuses that
// permission rather than a new TRANSPORT_COST_POST one.

import { NextRequest } from 'next/server';
import { transportCostController } from '@/modules/transport-cost/controllers/transport-cost.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const POST = withAuth(
  async (req: NextRequest) => transportCostController.postSourceRecord(req),
  { permission: Permission.FINANCE_MANAGE }
);
