// app/api/billing/upgrade/route.ts

import { NextRequest } from 'next/server';
import { billingController } from '@/modules/billing/controllers/billing.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const POST = withAuth(
  (req: NextRequest) => billingController.initiateUpgrade(req),
  { permission: Permission.ORG_MANAGE }
);