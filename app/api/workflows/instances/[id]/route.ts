// app/api/workflows/instances/[id]/route.ts
//
// PHASE 0, F-4 -- ROUTING DEFECT FOUND DURING REMEDIATION.
//
// This file did not exist. Its intended contents had been pasted into
// app/api/workflows/instances/[id]/steps/[stepId]/route.ts instead --
// that file still carried this file's header comment, declared
// `params: { id }` with no `stepId`, and called getInstance /
// cancelInstance. Two consequences, both real:
//
//   1. approveStep / rejectStep had NO HTTP route at all. The
//      controller methods existed and nothing reached them.
//   2. Instance read and cancellation were served at a path with a
//      REQUIRED but completely ignored `[stepId]` segment, so any
//      arbitrary value in that position worked
//      (/instances/abc/steps/anything -> cancel instance abc).
//
// Restored to the correct path here, with the permissions F-4 requires.
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
    return workflowController.getInstance(req, id);
  },
  { permission: Permission.WORKFLOW_VIEW }
);

export const DELETE = withAuth<RouteParams>(
  async (req, _context, { params }) => {
    const { id } = await params;
    return workflowController.cancelInstance(req, id);
  },
  { permission: Permission.WORKFLOW_CANCEL }
);
