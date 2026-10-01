// app/api/transport-cost/source-records/statuses/route.ts
//
// OLIVINE LIVE OPERATING MODEL, SLICE 5. Bulk lifecycle-status lookup
// for the operational table's status column. Registered as a static
// sibling of source-records/[id]/route.ts -- Next.js resolves the
// static "statuses" segment before the dynamic "[id]" segment, the same
// precedent as customers/search/route.ts coexisting with
// customers/[id]/deactivate/route.ts elsewhere in this module.
// VIEW-gated (read-only, same as GET /source-records itself).

import { NextRequest } from 'next/server';
import { transportCostController } from '@/modules/transport-cost/controllers/transport-cost.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth(
  async (req: NextRequest) => transportCostController.getSourceRecordStatuses(req),
  { permission: Permission.TRANSPORT_COST_VIEW }
);
