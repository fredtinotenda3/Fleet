// app/api/reporting/templates/[id]/route.ts

import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';
import { reportTemplateController } from '@/modules/reporting/controllers/report-template.controller';

type RouteParams = { params: { id: string } };

export const GET = withAuth<RouteParams>(
  async (req, context, { params }) => reportTemplateController.get(req, context, params.id),
  { permission: Permission.REPORT_VIEW }
);

export const DELETE = withAuth<RouteParams>(
  async (req, context, { params }) => reportTemplateController.delete(req, context, params.id),
  { permission: Permission.REPORT_DELETE }
);