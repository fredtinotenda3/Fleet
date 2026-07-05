// app/api/reporting/templates/[id]/instantiate/route.ts

import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';
import { reportTemplateController } from '@/modules/reporting/controllers/report-template.controller';

type RouteParams = { params: Promise<{ id: string }> };

export const POST = withAuth<RouteParams>(
  async (req, context, { params }) => reportTemplateController.instantiate(req, context, await params),
  { permission: Permission.REPORT_CREATE }
);