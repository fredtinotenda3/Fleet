// app/api/reports/route.ts
//
// FIX (🔴 Critical -- no authentication at all): this route had zero
// auth of any kind -- no withAuth, no session check, nothing. Anyone
// on the internet could list or create reports for any tenant. This is
// the legacy modules/reports subsystem, distinct from the properly
// secured modules/reporting (app/api/reporting/**, which already uses
// withAuth + Permission.REPORT_VIEW/CREATE consistently) -- flagging
// the duplication for a follow-up consolidation pass, but closing the
// auth hole here first since it's live right now.
import { NextRequest } from 'next/server';
import { reportController } from '@/modules/reports/controllers/report.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth(
  async (req: NextRequest) => reportController.listReports(req),
  { permission: Permission.REPORT_VIEW }
);

export const POST = withAuth(
  async (req: NextRequest) => reportController.createReport(req),
  { permission: Permission.REPORT_CREATE }
);