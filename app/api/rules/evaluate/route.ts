// app/api/rules/evaluate/route.ts

import { NextRequest } from 'next/server';
import { ruleController } from '@/modules/rules/controllers/rule.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const POST = withAuth(
  (req: NextRequest) => ruleController.evaluateTrigger(req),
  { permission: Permission.ORG_MANAGE }
);