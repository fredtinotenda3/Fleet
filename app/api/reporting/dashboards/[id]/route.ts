// app/api/reporting/dashboards/[id]/route.ts


import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';
import { dashboardController } from '@/modules/reporting/controllers/dashboard.controller';

type RouteParams = { params: Promise<{ id: string }> };

export const GET = withAuth<RouteParams>(async (req, context, { params }) => dashboardController.getById(req, context, await params), {
  permission: Permission.REPORT_VIEW,
});

export const PUT = withAuth<RouteParams>(async (req, context, { params }) => dashboardController.update(req, context, await params), {
  permission: Permission.REPORT_CREATE,
});

export const DELETE = withAuth<RouteParams>(async (req, context, { params }) => dashboardController.delete(req, context, await params), {
  permission: Permission.REPORT_DELETE,
});