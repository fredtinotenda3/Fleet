// app/api/workflows/instances/[id]/steps/[stepId]/reject/route.ts
//
// PHASE 0, F-4. Rejection is gated separately from approval
// (WORKFLOW_REJECT) because it is not the "safe" direction of an
// approval gate: it terminates a business process somebody else raised
// and writes a permanent audited decision attributed to this actor.
//
// The engine applies the SAME step-level check as approve -- see
// workflowEngine.rejectStep, which had no authorization check
// whatsoever before Phase 0.
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
    return workflowController.rejectStep(req, id, stepId);
  },
  { permission: Permission.WORKFLOW_REJECT }
);
