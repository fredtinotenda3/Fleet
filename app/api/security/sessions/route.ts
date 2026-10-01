// app/api/security/sessions/users/[userId]/route.ts

import { NextRequest } from 'next/server';
import { sessionController } from '@/modules/security/controllers/session.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

interface RouteParams {
  params: Promise<{ userId: string }>;
}

export const GET = withAuth<RouteParams>(
  async (req: NextRequest, context, { params }) => {
    const { userId } = await params;
    return sessionController.listSessionsForUser(req, context, userId);
  },
  { permission: Permission.SESSION_VIEW }
);