// app/api/transport-cost/customers/search/route.ts
//
// OLIVINE LIVE OPERATING MODEL, SLICE 3. Type-ahead search, read-only.

import { NextRequest } from 'next/server';
import { masterDataController } from '@/modules/transport-cost/controllers/master-data.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth(
  async (req: NextRequest) => masterDataController.searchCustomers(req),
  { permission: Permission.TRANSPORT_COST_VIEW }
);
