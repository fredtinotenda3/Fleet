// app/api/transport-cost/transporters/request-new/route.ts
//
// GAP-CLOSURE PASS, Objective 5. TRANSPORT_COST_NORMALIZE, not VIEW or
// IMPORT -- this writes master data (a new, review-gated
// TransportPartner row), the same class of action confirm-new/confirm-
// match already use that permission for. See
// request-new-transporter.command.ts for the full decision record.
//
// Sibling of transporters/search (a static segment; no [id] dynamic
// route exists under transporters/, so there is no precedence
// collision to reason about here).

import { NextRequest } from 'next/server';
import { masterDataController } from '@/modules/transport-cost/controllers/master-data.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const POST = withAuth(
  async (req: NextRequest) => masterDataController.requestNewTransporter(req),
  { permission: Permission.TRANSPORT_COST_NORMALIZE }
);
