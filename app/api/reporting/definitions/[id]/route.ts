// app/api/reporting/definitions/[id]/route.ts
//
// FIX (Critical — inconsistent params typing): this route typed
// RouteParams as a plain object (`{ params: { id: string } }`) and read
// `params.id` synchronously. In Next.js 15's App Router, `params` is
// always a Promise at runtime regardless of how it's typed, so
// `params.id` was `undefined` on every request — GET/PUT/DELETE for a
// single report definition always resolved `id` to `undefined`, which
// then failed downstream (ObjectId cast / NotFoundError) instead of
// operating on the intended record. Matches the Promise convention
// already used correctly by the sibling preview/pivot/drilldown routes.

import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';
import { reportDefinitionController } from '@/modules/reporting/controllers/report-definition.controller';

type RouteParams = { params: Promise<{ id: string }> };

export const GET = withAuth<RouteParams>(
  async (req, context, { params }) => {
    const { id } = await params;
    return reportDefinitionController.get(req, context, id);
  },
  { permission: Permission.REPORT_VIEW }
);

export const PUT = withAuth<RouteParams>(
  async (req, context, { params }) => {
    const { id } = await params;
    return reportDefinitionController.update(req, context, id);
  },
  { permission: Permission.REPORT_CREATE }
);

export const DELETE = withAuth<RouteParams>(
  async (req, context, { params }) => {
    const { id } = await params;
    return reportDefinitionController.delete(req, context, id);
  },
  { permission: Permission.REPORT_DELETE }
);