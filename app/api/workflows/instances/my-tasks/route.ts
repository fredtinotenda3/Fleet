// app/api/workflows/instances/my-tasks/route.ts
//
// PHASE 0, F-4: gated on WORKFLOW_VIEW. The controller keys "my" off
// the authenticated identity, so this cannot return another user's
// queue -- but a user with no workflow involvement at all has no
// business enumerating the surface either.
import { NextRequest } from 'next/server';
import { workflowController } from '@/modules/workflows/controllers/workflow.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth(
  (req: NextRequest) => workflowController.getMyTasks(req),
  { permission: Permission.WORKFLOW_VIEW }
);
