// app/api/reporting/kpis/[id]/route.ts

import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';
import { kpiDefinitionController } from '@/modules/reporting/controllers/kpi-definition.controller';

type RouteParams = { params: { id: string } };

export const GET = withAuth<RouteParams>(
  async (req, context, { params }) => kpiDefinitionController.get(req, context, params.id),
  { permission: Permission.REPORT_VIEW }
);

export const PUT = withAuth<RouteParams>(
  async (req, context, { params }) => kpiDefinitionController.update(req, context, params.id),
  { permission: Permission.REPORT_CREATE }
);

export const DELETE = withAuth<RouteParams>(
  async (req, context, { params }) => kpiDefinitionController.delete(req, context, params.id),
  { permission: Permission.REPORT_DELETE }
);