// app/api/reporting/dashboards/[id]/route.ts
//
// FIX (Medium — inconsistent params typing): this file typed RouteParams
// as a plain object (`{ params: { id: string } }`) and read `params.id`
// synchronously. In Next.js 15's App Router, params is always a Promise
// at runtime regardless of how it's typed — reading `.id` off it directly
// does not work. Sibling file dashboards/[id]/data/route.ts already had
// this right; matched that convention here.

import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';
import { dashboardController } from '@/modules/reporting/controllers/dashboard.controller';

type RouteParams = { params: Promise<{ id: string }> };

export const GET = withAuth<RouteParams>(
  async (req, context, { params }) => {
    const { id } = await params;
    return dashboardController.get(req, context, id);
  },
  { permission: Permission.REPORT_VIEW }
);

export const PUT = withAuth<RouteParams>(
  async (req, context, { params }) => {
    const { id } = await params;
    return dashboardController.update(req, context, id);
  },
  { permission: Permission.REPORT_CREATE }
);

export const DELETE = withAuth<RouteParams>(
  async (req, context, { params }) => {
    const { id } = await params;
    return dashboardController.delete(req, context, id);
  },
  { permission: Permission.REPORT_DELETE }
);