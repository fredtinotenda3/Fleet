// app/api/transport-cost/source-records/[id]/duplicate/route.ts
//
// OLIVINE LIVE OPERATING MODEL, SLICE 5. Creates a new, unposted record
// copying the original's editable fields -- an operational create, never
// a ledger write, so NORMALIZE-gated like Edit/Cancel.

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
    return transportCostController.duplicateSourceRecord(req, id);
  },
  { permission: Permission.TRANSPORT_COST_NORMALIZE }
);
