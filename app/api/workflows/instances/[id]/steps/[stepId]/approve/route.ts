// app/api/workflows/instances/[id]/steps/[stepId]/approve/route.ts
//
// PHASE 0, F-4: approving a workflow step had no HTTP route at all (see
// the sibling steps/[stepId]/route.ts for how that happened).
//
// TWO INDEPENDENT GATES, deliberately:
//
//   1. Permission.WORKFLOW_APPROVE here, which answers "may this ROLE
//      decide workflow steps at all".
//   2. workflowEngine.isAuthorizedForStep, which answers "is this the
//      right PERSON for THIS step" -- assignee membership or the step's
//      named role, evaluated against the instance.
//
// The second cannot be expressed as a permission, and the first cannot
// be enforced from inside the engine, so neither replaces the other.
import { NextRequest } from 'next/server';
import { workflowController } from '@/modules/workflows/controllers/workflow.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

interface RouteParams {
  params: Promise<{ id: string; stepId: string }>;
}

export const POST = withAuth<RouteParams>(
  async (req, _context, { params }) => {
    const { id, stepId } = await params;
    return workflowController.approveStep(req, id, stepId);
  },
  { permission: Permission.WORKFLOW_APPROVE }
);
