// app/api/transport-cost/vehicles/request-new/route.ts
//
// GAP-CLOSURE PASS, Objective 5. Same reasoning as
// transporters/request-new/route.ts.

import { NextRequest } from 'next/server';
import { masterDataController } from '@/modules/transport-cost/controllers/master-data.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const POST = withAuth(
  async (req: NextRequest) => masterDataController.requestNewVehicle(req),
  { permission: Permission.TRANSPORT_COST_NORMALIZE }
);
