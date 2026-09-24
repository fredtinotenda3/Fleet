// app/api/transport-cost/command-centre/summary/route.ts
//
// Command Centre Slice A/B/C. Read-only, VIEW-gated like every other
// transport-cost report route -- see app/api/transport-cost/report/route.ts's
// own header for why reading a report never requires the manage-level
// permission that posting/importing does.

import { NextRequest } from 'next/server';
import { transportCostController } from '@/modules/transport-cost/controllers/transport-cost.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth(
  async (req: NextRequest) => transportCostController.getCommandCentreSummary(req),
  { permission: Permission.TRANSPORT_COST_VIEW }
);
