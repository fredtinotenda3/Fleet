// app/api/reports/[id]/route.ts
//
// Legacy alias for fetching a single report definition. Proxies to
// modules/reporting's report-definition controller.
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';
import { reportDefinitionController } from '@/modules/reporting/controllers/report-definition.controller';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const GET = withAuth<RouteParams>(
  async (req, context, { params }) => {
    const { id } = await params;
    return reportDefinitionController.get(req, context, id);
  },
  { permission: Permission.REPORT_VIEW }
);