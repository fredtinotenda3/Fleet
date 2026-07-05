// app/api/security/sessions/[id]/route.ts

import { NextRequest } from 'next/server';
import { sessionController } from '@/modules/security/controllers/session.controller';
import { withAuth } from '@/server/middleware/with-auth';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const DELETE = withAuth<RouteParams>(async (req: NextRequest, context, { params }) => {
  const { id } = await params;
  return sessionController.revokeSession(req, context, id);
});