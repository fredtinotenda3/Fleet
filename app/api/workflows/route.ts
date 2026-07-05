// app/api/workflows/route.ts

import { NextRequest } from 'next/server';
import { workflowController } from '@/modules/workflows/controllers/workflow.controller';

export async function GET(req: NextRequest) {
  return workflowController.listWorkflows(req);
}

export async function POST(req: NextRequest) {
  return workflowController.createWorkflow(req);
}