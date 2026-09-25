// app/api/transport-cost/source-records/[id]/cancel/route.ts
//
// OLIVINE LIVE OPERATING MODEL, SLICE 5. Wired at the lower NORMALIZE
// privilege level; the controller itself escalates to require
// FINANCE_MANAGE when the record turns out to already be posted (see
// TransportCostController.cancelSourceRecord's own comment for why that
// check cannot live at this wrapper level -- it depends on the record's
// actual state, unknown until the handler reads it).

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
    return transportCostController.cancelSourceRecord(req, id);
  },
  { permission: Permission.TRANSPORT_COST_NORMALIZE }
);
