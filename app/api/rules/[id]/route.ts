// app/api/rules/[id]/route.ts

import { NextRequest } from 'next/server';
import { ruleController } from '@/modules/rules/controllers/rule.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const GET = withAuth<RouteParams>(
  async (req: NextRequest, _ctx, { params }) => {
    const { id } = await params;
    return ruleController.getRule(req, id);
  },
  { permission: Permission.ORG_VIEW }
);

export const PUT = withAuth<RouteParams>(
  async (req: NextRequest, _ctx, { params }) => {
    const { id } = await params;
    return ruleController.updateRule(req, id);
  },
  { permission: Permission.ORG_MANAGE }
);

export const DELETE = withAuth<RouteParams>(
  async (req: NextRequest, _ctx, { params }) => {
    const { id } = await params;
    return ruleController.deleteRule(req, id);
  },
  { permission: Permission.ORG_MANAGE }
);