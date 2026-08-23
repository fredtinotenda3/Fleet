// app/api/workflows/instances/route.ts
//
// PHASE 0, F-4: starting an instance binds a real entity into an
// approval chain, so it is WORKFLOW_START rather than "any session".
import { NextRequest } from 'next/server';
import { workflowController } from '@/modules/workflows/controllers/workflow.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth(
  (req: NextRequest) => workflowController.getInstancesForEntity(req),
  { permission: Permission.WORKFLOW_VIEW }
);

export const POST = withAuth(
  (req: NextRequest) => workflowController.startWorkflow(req),
  { permission: Permission.WORKFLOW_START }
);
