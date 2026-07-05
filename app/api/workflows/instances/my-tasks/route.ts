// app/api/workflows/instances/my-tasks/route.ts

import { NextRequest } from 'next/server';
import { workflowController } from '@/modules/workflows/controllers/workflow.controller';

export async function GET(req: NextRequest) {
  return workflowController.getMyTasks(req);
}