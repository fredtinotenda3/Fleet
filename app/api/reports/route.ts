// app/api/reports/route.ts
//
// Legacy alias for the report list/create endpoints. Proxies straight to
// the real reporting system (modules/reporting) instead of the removed
// modules/reports module.
import { NextRequest } from 'next/server';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';
import { reportDefinitionController } from '@/modules/reporting/controllers/report-definition.controller';

export const GET = withAuth(
  async (req: NextRequest, context) => reportDefinitionController.list(req, context),
  { permission: Permission.REPORT_VIEW }
);

export const POST = withAuth(
  async (req: NextRequest, context) => reportDefinitionController.create(req, context),
  { permission: Permission.REPORT_CREATE }
);