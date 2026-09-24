// app/api/transport-cost/vehicles/search/route.ts
//
// OLIVINE LIVE OPERATING MODEL, SLICE 3. Type-ahead search over
// CONFIRMED ContractedVehicle rows only -- no create route exists here.
// See master-data.service.ts's header for why. Accepts an optional
// ?transporterPartnerId= to narrow to one transporter's own fleet.

import { NextRequest } from 'next/server';
import { masterDataController } from '@/modules/transport-cost/controllers/master-data.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth(
  async (req: NextRequest) => masterDataController.searchVehicles(req),
  { permission: Permission.TRANSPORT_COST_VIEW }
);
