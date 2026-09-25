// app/api/transport-cost/master-data/[kind]/[id]/confirm/route.ts
//
// GAP-CLOSURE PASS, Objectives 1/3/5. TRANSPORT_COST_NORMALIZE -- same
// bar as the O2 review queue's own confirm-match/confirm-new routes:
// this is the human checkpoint that turns a 'needs-review' TransportPartner/
// ContractedVehicle into a 'confirmed' one every future search/match/
// report treats as authoritative.

import { NextRequest } from 'next/server';
import { masterDataController } from '@/modules/transport-cost/controllers/master-data.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

interface RouteParams {
  params: Promise<{ kind: string; id: string }>;
}

export const POST = withAuth<RouteParams>(
  async (req: NextRequest, _ctx, { params }) => {
    const { kind, id } = await params;
    return masterDataController.confirmPendingMasterData(req, kind, id);
  },
  { permission: Permission.TRANSPORT_COST_NORMALIZE }
);
