// app/api/security/mfa/status/route.ts

import { NextRequest } from 'next/server';
import { mfaController } from '@/modules/security/controllers/mfa.controller';
import { withAuth } from '@/server/middleware/with-auth';

export const GET = withAuth((req: NextRequest) => mfaController.status(req));