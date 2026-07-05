//app/api/reporting/dashboards/[id]/data/route.ts


import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';
import { dashboardController } from '@/modules/reporting/controllers/dashboard.controller';

type RouteParams = { params: Promise<{ id: string }> };

export const GET = withAuth<RouteParams>(async (req, context, { params }) => dashboardController.data(req, context, await params), {
  permission: Permission.REPORT_VIEW,
});