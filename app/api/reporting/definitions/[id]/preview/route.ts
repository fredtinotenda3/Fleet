// app/api/reporting/definitions/[id]/preview/route.ts
//
// FIX (Critical): this route called `reportDefinitionController.previewPivot(...)`
// (copy-pasted from the /pivot route) instead of `.preview(...)`, so hitting
// GET /api/reporting/definitions/:id/preview actually ran the pivot engine
// and threw a ValidationError for any report without a saved pivot config —
// the plain tabular preview used by the report builder UI was completely
// unreachable. Also fixed: `previewPivot`/`preview` both expect a string
// `id`, but this route passed the whole resolved `{ id }` params object.

import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';
import { reportDefinitionController } from '@/modules/reporting/controllers/report-definition.controller';

type RouteParams = { params: Promise<{ id: string }> };

export const GET = withAuth<RouteParams>(
  async (req, context, { params }) => {
    const { id } = await params;
    return reportDefinitionController.preview(req, context, id);
  },
  { permission: Permission.REPORT_VIEW }
);