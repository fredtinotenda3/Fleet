// app/api/reporting/kpis/[id]/evaluate/route.ts

import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';
import { kpiDefinitionController } from '@/modules/reporting/controllers/kpi-definition.controller';

type RouteParams = { params: Promise<{ id: string }> };

export const GET = withAuth<RouteParams>(async (req, context, { params }) => kpiDefinitionController.evaluate(req, context, await params), {
  permission: Permission.REPORT_VIEW,
});