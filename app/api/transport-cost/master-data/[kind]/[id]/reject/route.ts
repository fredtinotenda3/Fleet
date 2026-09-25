// app/api/transport-cost/master-data/[kind]/[id]/reject/route.ts
//
// GAP-CLOSURE PASS, Objectives 1/3/5. Same reasoning as this directory's
// confirm/route.ts sibling.

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
    return masterDataController.rejectPendingMasterData(req, kind, id);
  },
  { permission: Permission.TRANSPORT_COST_NORMALIZE }
);
