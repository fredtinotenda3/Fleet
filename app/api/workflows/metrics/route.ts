// app/api/workflows/metrics/route.ts
//
// PHASE 0, F-4: aggregate approval throughput across the organization
// is management reporting, gated on WORKFLOW_VIEW.
import { NextRequest } from 'next/server';
import { workflowController } from '@/modules/workflows/controllers/workflow.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth(
  (req: NextRequest) => workflowController.getMetrics(req),
  { permission: Permission.WORKFLOW_VIEW }
);
