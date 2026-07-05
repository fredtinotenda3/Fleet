// app/api/security/check/route.ts

import { NextRequest } from 'next/server';
import { permissionCheckController } from '@/modules/security/controllers/permission-check.controller';
import { withAuth } from '@/server/middleware/with-auth';

export const POST = withAuth(
  (req: NextRequest, context) => permissionCheckController.check(req, context)
);