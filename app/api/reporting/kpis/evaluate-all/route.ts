// app/api/reporting/kpis/evaluate-all/route.ts

import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';
import { kpiDefinitionController } from '@/modules/reporting/controllers/kpi-definition.controller';

export const GET = withAuth(async (req, context) => kpiDefinitionController.evaluateAll(req, context), {
  permission: Permission.REPORT_VIEW,
});