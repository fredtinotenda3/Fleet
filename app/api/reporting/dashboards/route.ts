//app/api/reporting/dashboards/route.ts

import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';
import { dashboardController } from '@/modules/reporting/controllers/dashboard.controller';

export const GET = withAuth(async (req, context) => dashboardController.list(req, context), {
  permission: Permission.REPORT_VIEW,
});

export const POST = withAuth(async (req, context) => dashboardController.create(req, context), {
  permission: Permission.REPORT_CREATE,
});