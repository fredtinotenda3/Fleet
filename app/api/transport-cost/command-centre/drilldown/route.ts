// app/api/transport-cost/command-centre/drilldown/route.ts
//
// GAP-CLOSURE PASS, Objective 4. Command Centre metric -> underlying
// evidence. Read-only, VIEW-gated exactly like
// command-centre/summary/route.ts above it -- see that route's own
// header for why reading a report never requires the manage-level
// permission that posting/importing does.

import { NextRequest } from 'next/server';
import { transportCostController } from '@/modules/transport-cost/controllers/transport-cost.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth(
  async (req: NextRequest) => transportCostController.getCommandCentreDrillDown(req),
  { permission: Permission.TRANSPORT_COST_VIEW }
);
