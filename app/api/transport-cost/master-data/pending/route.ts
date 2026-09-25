// app/api/transport-cost/master-data/pending/route.ts
//
// GAP-CLOSURE PASS, Objectives 1/3/5. Read-only listing of transporters/
// vehicles awaiting confirm/reject -- VIEW-gated like every other
// read-only transport-cost listing (the mutating confirm/reject routes
// below this same directory require TRANSPORT_COST_NORMALIZE instead).

import { NextRequest } from 'next/server';
import { masterDataController } from '@/modules/transport-cost/controllers/master-data.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth(
  async (req: NextRequest) => masterDataController.listPendingMasterData(req),
  { permission: Permission.TRANSPORT_COST_VIEW }
);
