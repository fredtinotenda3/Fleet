// app/api/reporting/definitions/[id]/route.ts

import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';
import { reportDefinitionController } from '@/modules/reporting/controllers/report-definition.controller';

type RouteParams = { params: { id: string } };

export const GET = withAuth<RouteParams>(
  async (req, context, { params }) => reportDefinitionController.get(req, context, params.id),
  { permission: Permission.REPORT_VIEW }
);

export const PUT = withAuth<RouteParams>(
  async (req, context, { params }) => reportDefinitionController.update(req, context, params.id),
  { permission: Permission.REPORT_CREATE }
);

export const DELETE = withAuth<RouteParams>(
  async (req, context, { params }) => reportDefinitionController.delete(req, context, params.id),
  { permission: Permission.REPORT_DELETE }
);