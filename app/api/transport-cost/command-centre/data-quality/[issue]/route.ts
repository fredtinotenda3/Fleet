// app/api/transport-cost/command-centre/data-quality/[issue]/route.ts
//
// GAP-CLOSURE PASS, Objective 4. The evidence rows behind one trust-
// panel count ("actionable exceptions visible"). Read-only, VIEW-gated
// like every other Command Centre read.

import { NextRequest } from 'next/server';
import { transportCostController } from '@/modules/transport-cost/controllers/transport-cost.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

interface RouteParams {
  params: Promise<{ issue: string }>;
}

export const GET = withAuth<RouteParams>(
  async (req: NextRequest, _ctx, { params }) => {
    const { issue } = await params;
    return transportCostController.getDataQualityIssueEvidence(req, issue);
  },
  { permission: Permission.TRANSPORT_COST_VIEW }
);
