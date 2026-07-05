// app/api/reporting/executions/[id]/download/route.ts

import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';
import { reportExecutionController } from '@/modules/reporting/controllers/report-execution.controller';

type RouteParams = { params: Promise<{ id: string }> };

export const GET = withAuth<RouteParams>(async (req, context, { params }) => reportExecutionController.download(req, context, await params), {
  permission: Permission.REPORT_VIEW,
});