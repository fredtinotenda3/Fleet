// BROKEN ENDPOINT FIX: this passed the awaited `params` OBJECT where the
// controller takes `id: string`, so `id` arrived as `{ id: "..." }`.
// ObjectId.isValid() then rejected it and the endpoint 404'd (or queried
// for the literal string "[object Object]") on every single call. tsc
// flagged it as TS2345 the whole time; `ignoreBuildErrors: true` shipped
// it anyway.
// app/api/reporting/kpis/[id]/evaluate/route.ts

import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';
import { kpiDefinitionController } from '@/modules/reporting/controllers/kpi-definition.controller';

type RouteParams = { params: Promise<{ id: string }> };

export const GET = withAuth<RouteParams>(async (req, context, { params }) => kpiDefinitionController.evaluate(req, context, (await params).id), {
  permission: Permission.REPORT_VIEW,
});