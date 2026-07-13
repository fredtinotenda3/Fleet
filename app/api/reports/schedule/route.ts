// app/api/reports/schedule/route.ts
//
// FIX (🔴 Critical -- no authentication at all): same bug as
// reports/route.ts.
import { NextRequest } from 'next/server';
import { reportController } from '@/modules/reports/controllers/report.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const POST = withAuth(
  async (req: NextRequest) => reportController.scheduleReport(req),
  { permission: Permission.REPORT_SCHEDULE }
);