// app/api/workflows/[id]/route.ts

import { NextRequest } from 'next/server';
import { workflowController } from '@/modules/workflows/controllers/workflow.controller';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  return workflowController.getWorkflow(req, id);
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  return workflowController.updateWorkflow(req, id);
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  return workflowController.deleteWorkflow(req, id);
}