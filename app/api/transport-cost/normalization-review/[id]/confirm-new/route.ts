// app/api/transport-cost/normalization-review/[id]/confirm-new/route.ts
//
// Phase O2. See app/api/transport-cost/normalization-review/route.ts's
// header for why this was missing. This is the ONLY code path that
// creates a new TransportPartner/ContractedVehicle row (see
// confirm-review-new.handler.ts and normalization-matcher.service.ts's
// "suggest only, never auto-merge" rule) -- a human confirming "this is
// a genuinely new transporter/vehicle, not a spelling variant of one we
// already know."

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
    return transportCostController.confirmReviewNew(req, id);
  },
  { permission: Permission.TRANSPORT_COST_NORMALIZE }
);
