// app/api/billing/upgrade/mobile/route.ts

import { NextRequest } from 'next/server';
import { billingController } from '@/modules/billing/controllers/billing.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const POST = withAuth(
  (req: NextRequest) => billingController.initiateMobileUpgrade(req),
  { permission: Permission.ORG_MANAGE }
);