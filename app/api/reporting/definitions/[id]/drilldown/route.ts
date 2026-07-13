// app/api/reporting/definitions/[id]/drilldown/route.ts
//
// FIX (Critical): `reportDefinitionController.drilldown` did not exist
// (added in report-definition.controller.ts) — every call here threw
// `TypeError: ... .drilldown is not a function`. Also fixed the same
// params-object-instead-of-id-string bug as the /preview and /pivot routes.

import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';
import { reportDefinitionController } from '@/modules/reporting/controllers/report-definition.controller';

type RouteParams = { params: Promise<{ id: string }> };

export const POST = withAuth<RouteParams>(
  async (req, context, { params }) => {
    const { id } = await params;
    return reportDefinitionController.drilldown(req, context, id);
  },
  { permission: Permission.REPORT_VIEW }
);