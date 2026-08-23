// app/api/workflows/[id]/route.ts
//
// PHASE 0, F-4: was withSession() (authenticated only) on all three
// verbs, so any authenticated user could edit or DELETE an
// organization's approval policy. Read is WORKFLOW_VIEW; mutation is
// WORKFLOW_MANAGE.
import { NextRequest } from 'next/server';
import { workflowController } from '@/modules/workflows/controllers/workflow.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const GET = withAuth<RouteParams>(
  async (req, _context, { params }) => {
    const { id } = await params;
    return workflowController.getWorkflow(req, id);
  },
  { permission: Permission.WORKFLOW_VIEW }
);

export const PUT = withAuth<RouteParams>(
  async (req, _context, { params }) => {
    const { id } = await params;
    return workflowController.updateWorkflow(req, id);
  },
  { permission: Permission.WORKFLOW_MANAGE }
);

export const DELETE = withAuth<RouteParams>(
  async (req, _context, { params }) => {
    const { id } = await params;
    return workflowController.deleteWorkflow(req, id);
  },
  { permission: Permission.WORKFLOW_MANAGE }
);
