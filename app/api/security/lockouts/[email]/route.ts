// app/api/security/lockouts/[email]/route.ts

import { NextRequest } from 'next/server';
import { threatDetectionController } from '@/modules/security/controllers/threat-detection.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

interface RouteParams {
  params: Promise<{ email: string }>;
}

export const DELETE = withAuth<RouteParams>(
  async (req: NextRequest, context, { params }) => {
    const { email } = await params;
    return threatDetectionController.unlockAccount(req, context, email);
  },
  { permission: Permission.ACCOUNT_LOCKOUT_MANAGE }
);