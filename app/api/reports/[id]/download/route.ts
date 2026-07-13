// app/api/reports/[id]/download/route.ts
//
// FIX (🔴 Critical -- no authentication at all, on a raw file download):
// this is the most serious of the four -- an unauthenticated report ID
// was enough to download report content (fleet expense/cost data) for
// any tenant, with no auth check anywhere in the request path.
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
    return reportController.downloadReport(req, id);
  },
  { permission: Permission.REPORT_VIEW }
);