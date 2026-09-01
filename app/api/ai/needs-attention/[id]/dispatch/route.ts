// app/api/ai/needs-attention/[id]/dispatch/route.ts
//
// BACKLOG ITEM 6 -- "dispatch only when an operator explicitly requests
// action" made concrete.
//
// PERMISSION, and why it is not the ANALYTICS_VIEW the sibling
// `resolve` route uses: resolving an item records that a human dealt
// with a finding. Dispatching one CREATES WORK -- a work order in a
// workshop queue, or a maintenance reminder with a due date and a cost.
// Those are the writes this endpoint performs by proxy, so it demands
// the permission that authorises them.
//
// `anyPermission` rather than a single one because the action taken
// depends on the item's source (`actionForSource`): a
// predictive-maintenance item schedules maintenance, a maintenance item
// raises a work order. A role holding either may dispatch, and the
// executor itself is what performs the corresponding domain write.

import { NextRequest } from 'next/server';
import { aiController } from '@/modules/ai/controllers/ai.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';
import { AuthContext } from '@/server/auth/auth-context';

export const dynamic = 'force-dynamic';

export const POST = withAuth(
  (req: NextRequest, _context: AuthContext, { params }: { params: { id: string } }) =>
    aiController.dispatchNeedsAttentionItem(req, params.id),
  { anyPermission: [Permission.WORKORDER_CREATE, Permission.MAINTENANCE_CREATE] }
);
