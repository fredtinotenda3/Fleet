// app/api/transport-cost/source-records/[id]/correct/route.ts
//
// OLIVINE LIVE OPERATING MODEL, SLICE 5. The only route that may change
// a financial field on a POSTED record -- FINANCE_MANAGE-gated, same
// privilege as the existing /postings routes, since this always can
// result in a ledger reversal + repost.

import { NextRequest } from 'next/server';
import { transportCostController } from '@/modules/transport-cost/controllers/transport-cost.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const POST = withAuth<RouteParams>(
  async (req: NextRequest, _ctx, { params }) => {
    const { id } = await params;
    return transportCostController.correctPostedSourceRecord(req, id);
  },
  { permission: Permission.FINANCE_MANAGE }
);
