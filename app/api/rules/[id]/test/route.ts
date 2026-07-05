// app/api/rules/[id]/test/route.ts

import { NextRequest } from 'next/server';
import { ruleController } from '@/modules/rules/controllers/rule.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const POST = withAuth<RouteParams>(
  async (req: NextRequest, _ctx, { params }) => {
    const { id } = await params;
    return ruleController.testRule(req, id);
  },
  { permission: Permission.ORG_VIEW }
);