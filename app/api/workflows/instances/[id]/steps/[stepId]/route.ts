// app/api/workflows/instances/[id]/steps/[stepId]/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { workflowController } from '@/modules/workflows/controllers/workflow.controller';

interface RouteParams {
  params: Promise<{ id: string; stepId: string }>;
}

/**
 * Action is determined by `?action=approve|reject` since approve and
 * reject have different request bodies (comment vs. required reason)
 * and both are semantically "update this step's outcome".
 */
export async function PUT(req: NextRequest, { params }: RouteParams) {
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