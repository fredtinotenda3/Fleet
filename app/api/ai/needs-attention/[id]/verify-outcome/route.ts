// app/api/ai/needs-attention/[id]/verify-outcome/route.ts
//
// MODULE CONNECTIVITY UPGRADE -- "Attention/Actions ↔ Outcome
// Verification". Same permission as the sibling .../resolve route:
// verifying an outcome is part of the same analyst workflow as
// resolving the item in the first place.

import { NextRequest } from 'next/server';
import { aiController } from '@/modules/ai/controllers/ai.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';
import { AuthContext } from '@/server/auth/auth-context';

export const dynamic = 'force-dynamic';

export const POST = withAuth(
  (req: NextRequest, context: AuthContext, { params }: { params: { id: string } }) =>
    aiController.verifyNeedsAttentionOutcome(req, params.id),
  { permission: Permission.ANALYTICS_VIEW }
);
