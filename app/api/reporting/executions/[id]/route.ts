// app/api/reporting/executions/[id]/route.ts
//
// FIX (Critical — same params-Promise bug as definitions/[id]/route.ts):
// `params` was typed and read synchronously, so `id` was always `undefined`
// under Next.js 15's App Router, breaking GET of a single report execution
// (used for status polling after a report/export is generated).

import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';
import { reportExecutionController } from '@/modules/reporting/controllers/report-execution.controller';

type RouteParams = { params: Promise<{ id: string }> };

export const GET = withAuth<RouteParams>(
  async (req, context, { params }) => {
    const { id } = await params;
    return reportExecutionController.get(req, context, id);
  },
  { permission: Permission.REPORT_VIEW }
);