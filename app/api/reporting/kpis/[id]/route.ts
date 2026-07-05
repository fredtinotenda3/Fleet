// app/api/reporting/kpis/[id]/route.ts


import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';
import { kpiDefinitionController } from '@/modules/reporting/controllers/kpi-definition.controller';

type RouteParams = { params: Promise<{ id: string }> };

export const GET = withAuth<RouteParams>(async (req, context, { params }) => kpiDefinitionController.getById(req, context, await params), {
  permission: Permission.REPORT_VIEW,
});

export const PUT = withAuth<RouteParams>(async (req, context, { params }) => kpiDefinitionController.update(req, context, await params), {
  permission: Permission.REPORT_CREATE,
});

export const DELETE = withAuth<RouteParams>(async (req, context, { params }) => kpiDefinitionController.delete(req, context, await params), {
  permission: Permission.REPORT_DELETE,
});