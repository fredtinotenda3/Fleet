// app/api/reporting/kpis/[id]/route.ts
//
// FIX (Critical — same params-Promise bug as definitions/[id]/route.ts):
// `params` was typed and read synchronously, so `id` was always `undefined`
// under Next.js 15's App Router, breaking GET/PUT/DELETE of a single KPI
// definition.

import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';
import { kpiDefinitionController } from '@/modules/reporting/controllers/kpi-definition.controller';

type RouteParams = { params: Promise<{ id: string }> };

export const GET = withAuth<RouteParams>(
  async (req, context, { params }) => {
    const { id } = await params;
    return kpiDefinitionController.get(req, context, id);
  },
  { permission: Permission.REPORT_VIEW }
);

export const PUT = withAuth<RouteParams>(
  async (req, context, { params }) => {
    const { id } = await params;
    return kpiDefinitionController.update(req, context, id);
  },
  { permission: Permission.REPORT_CREATE }
);

export const DELETE = withAuth<RouteParams>(
  async (req, context, { params }) => {
    const { id } = await params;
    return kpiDefinitionController.delete(req, context, id);
  },
  { permission: Permission.REPORT_DELETE }
);