// app/api/workflows/route.ts
//
// FIX (🔴 Critical -- no authentication at all): zero auth of any kind.
// No dedicated WORKFLOW_* permission exists yet in
// server/permissions/roles.ts, so this is the minimum fix -- requires
// an authenticated session via withSession() -- closing the
// open-to-the-internet hole immediately. See
// server/permissions/roles.workflow-addendum.ts for the proper
// permission model this should be upgraded to.
import { NextRequest } from 'next/server';
import { workflowController } from '@/modules/workflows/controllers/workflow.controller';
import { withSession } from '@/server/middleware/with-auth';

export const GET = withSession(
  async (req: NextRequest) => workflowController.listWorkflows(req)
);

export const POST = withSession(
  async (req: NextRequest) => workflowController.createWorkflow(req)
);