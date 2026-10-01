// app/api/transport-cost/report/vehicles/[id]/route.ts
//
// Phase O4. Stream/Vehicle -> individual-postings drill-down.

import { NextRequest } from 'next/server';
import { transportCostController } from '@/modules/transport-cost/controllers/transport-cost.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const GET = withAuth<RouteParams>(
  async (req: NextRequest, _ctx, { params }) => {
    const { id } = await params;
    return transportCostController.getPostingsForVehicle(req, id);
  },
  { permission: Permission.TRANSPORT_COST_VIEW }
);
