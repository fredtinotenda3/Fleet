// app/api/reports/[id]/route.ts
//
// FIX (🔴 Critical -- no authentication at all): same bug as
// reports/route.ts.
import { NextRequest } from 'next/server';
import { reportController } from '@/modules/reports/controllers/report.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const GET = withAuth<RouteParams>(
  async (req, _context, { params }) => {
    const { id } = await params;
    return reportController.getReport(req, id);
  },
  { permission: Permission.REPORT_VIEW }
);