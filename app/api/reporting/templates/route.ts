// app/api/reporting/templates/route.ts


import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';
import { reportTemplateController } from '@/modules/reporting/controllers/report-template.controller';

export const GET = withAuth(async (req, context) => reportTemplateController.list(req, context), {
  permission: Permission.REPORT_VIEW,
});

export const POST = withAuth(async (req, context) => reportTemplateController.create(req, context), {
  permission: Permission.REPORT_CREATE,
});