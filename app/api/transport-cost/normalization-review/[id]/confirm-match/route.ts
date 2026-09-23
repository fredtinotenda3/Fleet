// app/api/transport-cost/normalization-review/[id]/confirm-match/route.ts
//
// Phase O2. See app/api/transport-cost/normalization-review/route.ts's
// header for why this was missing. TRANSPORT_COST_NORMALIZE, not VIEW
// or IMPORT -- confirming "this fuzzy match is correct" writes master
// data (resolves the review item onto an existing TransportPartner /
// ContractedVehicle) that every future import and O3 ledger posting
// then resolves against, per that permission's own doc comment in
// server/permissions/roles.ts.

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
    return transportCostController.confirmReviewMatch(req, id);
  },
  { permission: Permission.TRANSPORT_COST_NORMALIZE }
);
