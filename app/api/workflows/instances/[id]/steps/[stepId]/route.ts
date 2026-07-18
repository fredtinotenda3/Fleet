// app/api/workflows/instances/[id]/route.ts
//
// Wires up single-instance lookup and cancellation. Previously missing —
// workflowController.getInstance / cancelInstance had no route pointing
// at them.
import { NextRequest } from 'next/server';
import { workflowController } from '@/modules/workflows/controllers/workflow.controller';
import { withSession } from '@/server/middleware/with-auth';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const GET = withSession<RouteParams>(
  async (req, _context, { params }) => {
    const { id } = await params;
    return workflowController.getInstance(req, id);
  }
);

export const DELETE = withSession<RouteParams>(
  async (req, _context, { params }) => {
    const { id } = await params;
    return workflowController.cancelInstance(req, id);
  }
);