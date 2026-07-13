// app/api/workflows/metrics/route.ts
import { NextRequest } from 'next/server';
import { workflowController } from '@/modules/workflows/controllers/workflow.controller';
import { withSession } from '@/server/middleware/with-auth';

export const GET = withSession(
  async (req: NextRequest) => workflowController.getMetrics(req)
);