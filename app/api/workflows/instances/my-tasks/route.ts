// app/api/workflows/instances/my-tasks/route.ts
//
// FIX (🔴 Critical -- no authentication at all): this one is
// particularly bad on its own -- "my tasks" with no session means the
// controller has no reliable notion of "my" at all without an
// authenticated identity to key off of.
import { NextRequest } from 'next/server';
import { workflowController } from '@/modules/workflows/controllers/workflow.controller';
import { withSession } from '@/server/middleware/with-auth';

export const GET = withSession(
  async (req: NextRequest) => workflowController.getMyTasks(req)
);