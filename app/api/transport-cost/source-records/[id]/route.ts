// app/api/transport-cost/source-records/[id]/route.ts
//
// OLIVINE LIVE OPERATING MODEL, SLICE 5. GET (operational detail view,
// read-only) and PATCH (Edit -- non-financial fields, or any field on a
// never-posted record). See transport-cost.controller.ts's own header
// for the full action inventory this slice adds.

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
    return transportCostController.getOperationalRecord(req, id);
  },
  { permission: Permission.TRANSPORT_COST_VIEW }
);

export const PATCH = withAuth<RouteParams>(
  async (req: NextRequest, _ctx, { params }) => {
    const { id } = await params;
    return transportCostController.editSourceRecord(req, id);
  },
  { permission: Permission.TRANSPORT_COST_NORMALIZE }
);
