// app/api/transport-cost/destinations/route.ts
//
// OLIVINE LIVE OPERATING MODEL, SLICE 3. Structurally identical to
// customers/route.ts -- see that file's header for the full reasoning.

import { NextRequest } from 'next/server';
import { masterDataController } from '@/modules/transport-cost/controllers/master-data.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth(
  async (req: NextRequest) => masterDataController.listDestinations(req),
  { permission: Permission.TRANSPORT_COST_VIEW }
);

export const POST = withAuth(
  async (req: NextRequest) => masterDataController.createDestination(req),
  { permission: Permission.TRANSPORT_COST_IMPORT }
);
