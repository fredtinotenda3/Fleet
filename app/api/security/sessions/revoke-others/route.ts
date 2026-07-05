// app/api/security/sessions/revoke-others/route.ts

import { NextRequest } from 'next/server';
import { sessionController } from '@/modules/security/controllers/session.controller';
import { withAuth } from '@/server/middleware/with-auth';

export const POST = withAuth(
  (req: NextRequest, context) => sessionController.revokeAllOtherSessions(req, context)
);