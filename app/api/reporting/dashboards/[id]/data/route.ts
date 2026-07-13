//app/api/reporting/dashboards/[id]/data/route.ts
//
// FIX (Medium, discovered while fixing the params-typing drift): this
// route called `dashboardController.data(...)`, a method that does not
// exist on DashboardController — only list/get/render/create/update/
// delete are defined. `render(id, tenantId)` returns exactly the
// widget-execution payload this endpoint's name implies, and the
// controller has a standing comment "No route wired yet -- see the
// render/download/evaluate note above" on render(), suggesting this was
// meant to be that route and got mis-wired. Rewired to call render();
// flag if a genuinely separate "data" endpoint was intended instead.

import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';
import { dashboardController } from '@/modules/reporting/controllers/dashboard.controller';

type RouteParams = { params: Promise<{ id: string }> };

export const GET = withAuth<RouteParams>(async (req, context, { params }) => {
  const { id } = await params;
  return dashboardController.render(req, context, id);
}, {
  permission: Permission.REPORT_VIEW,
});