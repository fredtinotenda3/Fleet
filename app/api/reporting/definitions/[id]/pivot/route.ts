// app/api/reporting/definitions/[id]/pivot/route.ts
//
// FIX (High): passed the whole resolved `{ id }` params object where
// `previewPivot(req, context, id: string)` expects a plain string id.

import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';
import { reportDefinitionController } from '@/modules/reporting/controllers/report-definition.controller';

type RouteParams = { params: Promise<{ id: string }> };

export const GET = withAuth<RouteParams>(
  async (req, context, { params }) => {
    const { id } = await params;
    return reportDefinitionController.previewPivot(req, context, id);
  },
  { permission: Permission.REPORT_VIEW }
);