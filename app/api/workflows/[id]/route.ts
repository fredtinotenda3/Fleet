// app/api/workflows/[id]/route.ts
import { NextRequest } from 'next/server';
import { workflowController } from '@/modules/workflows/controllers/workflow.controller';
import { withSession } from '@/server/middleware/with-auth';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const GET = withSession<RouteParams>(
  async (req, _context, { params }) => {
    const { id } = await params;
    return workflowController.getWorkflow(req, id);
  }
);

export const PUT = withSession<RouteParams>(
  async (req, _context, { params }) => {
    const { id } = await params;
    return workflowController.updateWorkflow(req, id);
  }
);

export const DELETE = withSession<RouteParams>(
  async (req, _context, { params }) => {
    const { id } = await params;
    return workflowController.deleteWorkflow(req, id);
  }
);