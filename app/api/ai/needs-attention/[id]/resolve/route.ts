// app/api/ai/needs-attention/[id]/resolve/route.ts
//
// ROUND 5 FIX -- this was gated on ANALYTICS_VIEW, which VIEWER
// (deliberately read-only) and AUDITOR (independent oversight over the
// very items being triaged) both hold. Resolving an item is a mutation
// of the attention item's triage state, not a read, so it now requires
// ANALYTICS_MANAGE (see that permission's own doc comment in
// server/permissions/roles.ts for the full rationale).

import { NextRequest } from 'next/server';
import { aiController } from '@/modules/ai/controllers/ai.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';
import { AuthContext } from '@/server/auth/auth-context';

export const dynamic = 'force-dynamic';

export const POST = withAuth(
  (req: NextRequest, context: AuthContext, { params }: { params: { id: string } }) =>
    aiController.resolveNeedsAttentionItem(req, params.id),
  { permission: Permission.ANALYTICS_MANAGE }
);