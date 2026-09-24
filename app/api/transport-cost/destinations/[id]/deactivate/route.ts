// app/api/transport-cost/destinations/[id]/deactivate/route.ts
//
// OLIVINE LIVE OPERATING MODEL, SLICE 3. See customers/[id]/deactivate/
// route.ts -- identical reasoning.

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
    return masterDataController.deactivateDestination(req, id);
  },
  { permission: Permission.TRANSPORT_COST_IMPORT }
);
