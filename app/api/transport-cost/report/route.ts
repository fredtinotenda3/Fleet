// app/api/transport-cost/report/route.ts
//
// Phase O4 (minimal slice). Read-only, VIEW-gated like every other
// report in this codebase -- posting stays gated on FINANCE_MANAGE
// (see app/api/transport-cost/postings/route.ts), reading the resulting
// report does not require that same accounting authority.

import { NextRequest } from 'next/server';
import { transportCostController } from '@/modules/transport-cost/controllers/transport-cost.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth(
  async (req: NextRequest) => transportCostController.getAllocationReport(req),
  { permission: Permission.TRANSPORT_COST_VIEW }
);
