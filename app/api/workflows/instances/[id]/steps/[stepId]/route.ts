// app/api/workflows/instances/[id]/steps/[stepId]/route.ts
//
// FIX (🔴 Critical -- no authentication at all, on an approve/reject
// action): this endpoint approves or rejects a workflow step (e.g. a
// purchase order or expense approval gate) with zero auth check
// anywhere in the request path. Fixed with withSession(); the
// controller must still independently verify the caller is actually
// the assigned approver for this step -- session auth alone doesn't
// establish that, only that *someone* is logged in.
import { NextRequest, NextResponse } from 'next/server';
import { workflowController } from '@/modules/workflows/controllers/workflow.controller';
import { withSession } from '@/server/middleware/with-auth';

interface RouteParams {
  params: Promise<{ id: string; stepId: string }>;
}

export const PUT = withSession<RouteParams>(
  async (req, _context, { params }) => {
    const { id, stepId } = await params;
    const action = req.nextUrl.searchParams.get('action');

    if (action === 'reject') {
      return workflowController.rejectStep(req, id, stepId);
    }
    if (action === 'approve') {
      return workflowController.approveStep(req, id, stepId);
    }

    return NextResponse.json(
      {
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Query param "action" must be "approve" or "reject"' },
      },
      { status: 400 }
    );
  }
);