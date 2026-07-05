// app/api/reporting/templates/[id]/route.ts

import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';
import { reportTemplateController } from '@/modules/reporting/controllers/report-template.controller';

type RouteParams = { params: Promise<{ id: string }> };

export const DELETE = withAuth<RouteParams>(async (req, context, { params }) => reportTemplateController.delete(req, context, await params), {
  permission: Permission.REPORT_DELETE,
});