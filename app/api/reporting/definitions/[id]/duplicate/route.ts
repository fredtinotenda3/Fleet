// app/api/reporting/definitions/[id]/duplicate/route.ts
//
// NEW (High): report-definition.controller.ts has always had a fully
// implemented `duplicate()` method (clones a saved report definition),
// but no route exposed it — the "Duplicate report" action required by
// the spec had no backing endpoint. Wired here.

import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';
import { reportDefinitionController } from '@/modules/reporting/controllers/report-definition.controller';

type RouteParams = { params: Promise<{ id: string }> };

export const POST = withAuth<RouteParams>(
  async (req, context, { params }) => {
    const { id } = await params;
    return reportDefinitionController.duplicate(req, context, id);
  },
  { permission: Permission.REPORT_CREATE }
);