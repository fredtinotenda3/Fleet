// app/api/rules/route.ts

import { NextRequest } from 'next/server';
import { ruleController } from '@/modules/rules/controllers/rule.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

/**
 * Using the existing ORG_VIEW / ORG_MANAGE permissions as the initial gate
 * for rule authoring. See server/permissions/roles.rules-addendum.ts for
 * dedicated RULE_VIEW/RULE_CREATE/RULE_EDIT/RULE_DELETE/RULE_TEST
 * permissions to introduce once finer-grained rule access control is
 * needed (e.g. letting fleet managers view/test rules without letting
 * them author new ones).
 */
export const GET = withAuth(
  (req: NextRequest) => ruleController.listRules(req),
  { permission: Permission.ORG_VIEW }
);

export const POST = withAuth(
  (req: NextRequest) => ruleController.createRule(req),
  { permission: Permission.ORG_MANAGE }
);