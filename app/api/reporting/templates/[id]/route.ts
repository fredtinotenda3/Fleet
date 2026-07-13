// app/api/reporting/templates/[id]/route.ts
//
// FIX (Critical — same params-Promise bug as definitions/[id]/route.ts):
// `params` was typed and read synchronously, so `id` was always `undefined`
// under Next.js 15's App Router, breaking GET/DELETE of a single report
// template.

import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';
import { reportTemplateController } from '@/modules/reporting/controllers/report-template.controller';

type RouteParams = { params: Promise<{ id: string }> };

export const GET = withAuth<RouteParams>(
  async (req, context, { params }) => {
    const { id } = await params;
    return reportTemplateController.get(req, context, id);
  },
  { permission: Permission.REPORT_VIEW }
);

export const DELETE = withAuth<RouteParams>(
  async (req, context, { params }) => {
    const { id } = await params;
    return reportTemplateController.delete(req, context, id);
  },
  { permission: Permission.REPORT_DELETE }
);