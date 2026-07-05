//app/api/reporting/definitions/[id]/drilldown/route.ts ===

import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';
import { reportDefinitionController } from '@/modules/reporting/controllers/report-definition.controller';

type RouteParams = { params: Promise<{ id: string }> };

export const POST = withAuth<RouteParams>(
  async (req, context, { params }) => reportDefinitionController.drilldown(req, context, await params),
  { permission: Permission.REPORT_VIEW }
);