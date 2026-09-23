// app/api/transport-cost/normalization-review/[id]/reject/route.ts
//
// Phase O2. See app/api/transport-cost/normalization-review/route.ts's
// header for why this was missing. Rejects a review item (e.g. a
// blocklisted/garbage value like "VAT EXCL" that slipped through, or a
// row someone decides needs re-entry rather than normalization) without
// creating or resolving anything -- requires a reason, same as the
// controller method already enforces.

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
    return transportCostController.rejectReviewItem(req, id);
  },
  { permission: Permission.TRANSPORT_COST_NORMALIZE }
);
