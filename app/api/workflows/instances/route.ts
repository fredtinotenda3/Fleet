// app/api/workflows/instances/route.ts

import { NextRequest } from 'next/server';
import { workflowController } from '@/modules/workflows/controllers/workflow.controller';

export async function GET(req: NextRequest) {
  return workflowController.getInstancesForEntity(req);
}

export async function POST(req: NextRequest) {
  return workflowController.startWorkflow(req);
}