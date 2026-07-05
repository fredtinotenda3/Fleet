// app/api/webhooks/subscriptions/route.ts

import { NextRequest } from 'next/server';
import { webhookSubscriptionController } from '@/modules/webhooks/controllers/webhook-subscription.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth(
  (req: NextRequest) => webhookSubscriptionController.list(req),
  { permission: Permission.WEBHOOK_VIEW }
);

export const POST = withAuth(
  (req: NextRequest) => webhookSubscriptionController.create(req),
  { permission: Permission.WEBHOOK_MANAGE }
);