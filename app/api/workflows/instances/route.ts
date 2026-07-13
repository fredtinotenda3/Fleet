// app/api/workflows/instances/route.ts
//
// FIX (🔴 Critical -- no authentication at all): see workflows/route.ts.
import { NextRequest } from 'next/server';
import { workflowController } from '@/modules/workflows/controllers/workflow.controller';
import { withSession } from '@/server/middleware/with-auth';

export const GET = withSession(
  async (req: NextRequest) => workflowController.getInstancesForEntity(req)
);

export const POST = withSession(
  async (req: NextRequest) => workflowController.startWorkflow(req)
);