// app/api/security/lockouts/route.ts

import { NextRequest } from 'next/server';
import { threatDetectionController } from '@/modules/security/controllers/threat-detection.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth(
  (req: NextRequest, context) => threatDetectionController.listLockedAccounts(req, context),
  { permission: Permission.ACCOUNT_LOCKOUT_MANAGE }
);