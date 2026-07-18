// app/api/reports/[id]/download/route.ts
//
// Legacy alias for downloading a generated report file. This maps [id] to
// a ReportExecution id and reuses reportExecutionController.download,
// which already returns the raw binary (not the JSON envelope) with the
// correct Content-Type/Content-Disposition headers.
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';
import { reportExecutionController } from '@/modules/reporting/controllers/report-execution.controller';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const GET = withAuth<RouteParams>(
  async (req, context, { params }) => {
    const { id } = await params;
    return reportExecutionController.download(req, context, id);
  },
  { permission: Permission.REPORT_VIEW }
);