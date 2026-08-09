// app/api/ai/needs-attention/[id]/resolve/route.ts

import { NextRequest } from 'next/server';
import { aiController } from '@/modules/ai/controllers/ai.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';
import { AuthContext } from '@/server/auth/auth-context';

export const dynamic = 'force-dynamic';

export const POST = withAuth(
  (req: NextRequest, context: AuthContext, { params }: { params: { id: string } }) =>
    aiController.resolveNeedsAttentionItem(req, params.id),
  { permission: Permission.ANALYTICS_VIEW }
);