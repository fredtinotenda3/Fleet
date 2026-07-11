// app/api/reporting/dashboards/[id]/route.ts

import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';
import { dashboardController } from '@/modules/reporting/controllers/dashboard.controller';

type RouteParams = { params: { id: string } };

export const GET = withAuth<RouteParams>(
  async (req, context, { params }) => dashboardController.get(req, context, params.id),
  { permission: Permission.REPORT_VIEW }
);

export const PUT = withAuth<RouteParams>(
  async (req, context, { params }) => dashboardController.update(req, context, params.id),
  { permission: Permission.REPORT_CREATE }
);

export const DELETE = withAuth<RouteParams>(
  async (req, context, { params }) => dashboardController.delete(req, context, params.id),
  { permission: Permission.REPORT_DELETE }
);