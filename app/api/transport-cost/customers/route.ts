// app/api/transport-cost/customers/route.ts
//
// OLIVINE LIVE OPERATING MODEL, SLICE 3. GET lists (simple management
// surface); POST is manual-entry's "+ Add New Customer" find-or-create.
// POST uses TRANSPORT_COST_IMPORT -- the same permission that already
// gates manual entry and bulk import (see transport-cost.controller.ts's
// import routes) -- rather than a new permission: creating a Customer
// record is part of the same "enter transport-cost data" capability, not
// a separate administrative action.

import { NextRequest } from 'next/server';
import { masterDataController } from '@/modules/transport-cost/controllers/master-data.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth(
  async (req: NextRequest) => masterDataController.listCustomers(req),
  { permission: Permission.TRANSPORT_COST_VIEW }
);

export const POST = withAuth(
  async (req: NextRequest) => masterDataController.createCustomer(req),
  { permission: Permission.TRANSPORT_COST_IMPORT }
);
