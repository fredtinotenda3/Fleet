// app/api/security/mfa/disable/route.ts

import { NextRequest } from 'next/server';
import { mfaController } from '@/modules/security/controllers/mfa.controller';
import { withAuth } from '@/server/middleware/with-auth';

export const POST = withAuth((req: NextRequest) => mfaController.disable(req));