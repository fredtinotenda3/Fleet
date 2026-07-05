// app/api/reporting/kpis/route.ts

import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';
import { kpiDefinitionController } from '@/modules/reporting/controllers/kpi-definition.controller';

export const GET = withAuth(async (req, context) => kpiDefinitionController.list(req, context), {
  permission: Permission.REPORT_VIEW,
});

export const POST = withAuth(async (req, context) => kpiDefinitionController.create(req, context), {
  permission: Permission.REPORT_CREATE,
});