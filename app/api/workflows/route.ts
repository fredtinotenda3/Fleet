// app/api/workflows/route.ts
//
// PHASE 0, F-4. These handlers were wrapped in withSession() -- which
// proves only that SOMEONE is logged in -- with a comment saying no
// WORKFLOW_* permission existed yet. It does now (see
// server/permissions/roles.ts), so authoring and listing are gated
// properly.
//
// Creating a workflow DEFINITION requires WORKFLOW_MANAGE, which is
// deliberately granted only at organization level: a definition is
// organization-wide approval policy, and a branch manager who can
// approve within their own scope must not be able to rewrite the chain
// that governs everyone.
import { NextRequest } from 'next/server';
import { workflowController } from '@/modules/workflows/controllers/workflow.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth(
  (req: NextRequest) => workflowController.listWorkflows(req),
  { permission: Permission.WORKFLOW_VIEW }
);

export const POST = withAuth(
  (req: NextRequest) => workflowController.createWorkflow(req),
  { permission: Permission.WORKFLOW_MANAGE }
);
