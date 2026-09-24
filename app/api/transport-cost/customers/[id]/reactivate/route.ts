// app/api/transport-cost/customers/[id]/reactivate/route.ts
//
// OLIVINE LIVE OPERATING MODEL, SLICE 3. Undo for the deactivate route
// alongside this one -- reversibility for every write this slice adds,
// per the client's own "document reversibility" requirement.

import { NextRequest } from 'next/server';
import { masterDataController } from '@/modules/transport-cost/controllers/master-data.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const POST = withAuth<RouteParams>(
  async (req: NextRequest, _ctx, { params }) => {
    const { id } = await params;
    return masterDataController.reactivateCustomer(req, id);
  },
  { permission: Permission.TRANSPORT_COST_IMPORT }
);
