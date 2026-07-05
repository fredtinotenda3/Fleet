// app/api/security/sessions/route.ts

import { NextRequest } from 'next/server';
import { sessionController } from '@/modules/security/controllers/session.controller';
import { withAuth } from '@/server/middleware/with-auth';

export const GET = withAuth(
  (req: NextRequest, context) => sessionController.listMySessions(req, context)
);