// app/api/transport-cost/customers/[id]/deactivate/route.ts
//
// OLIVINE LIVE OPERATING MODEL, SLICE 3. Soft "hide from new-entry
// search" toggle -- NOT a delete (see customer.repository.ts's header:
// historical records must keep resolving). TRANSPORT_COST_IMPORT: same
// reasoning as the create route above.

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
    return masterDataController.deactivateCustomer(req, id);
  },
  { permission: Permission.TRANSPORT_COST_IMPORT }
);
