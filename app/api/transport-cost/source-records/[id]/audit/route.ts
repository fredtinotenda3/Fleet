// app/api/transport-cost/source-records/[id]/audit/route.ts
//
// GAP-CLOSURE PASS, Objective 1. TRANSPORT_COST_VIEW -- same bar as
// GET .../source-records/[id] itself (this section only ever appears
// on a page the caller could already open), not the platform-wide
// Permission.AUDIT_LOG_VIEW the generic /api/security/audit-log route
// requires. See TransportCostRecordCommandService.getAuditHistory's
// header for the full reasoning.

import { NextRequest } from 'next/server';
import { transportCostController } from '@/modules/transport-cost/controllers/transport-cost.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const GET = withAuth<RouteParams>(
  async (req: NextRequest, _ctx, { params }) => {
    const { id } = await params;
    return transportCostController.getSourceRecordAuditHistory(req, id);
  },
  { permission: Permission.TRANSPORT_COST_VIEW }
);
