// app/api/reporting/executions/route.ts

import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';
import { reportExecutionController } from '@/modules/reporting/controllers/report-execution.controller';

export const GET = withAuth(async (req, context) => reportExecutionController.list(req, context), {
  permission: Permission.REPORT_VIEW,
});

export const POST = withAuth(async (req, context) => reportExecutionController.generate(req, context), {
  permission: Permission.REPORT_CREATE,
});