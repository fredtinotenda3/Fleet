// app/api/webhooks/subscriptions/[id]/deliveries/route.ts

import { NextRequest } from 'next/server';
import { webhookSubscriptionController } from '@/modules/webhooks/controllers/webhook-subscription.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const GET = withAuth<RouteParams>(
  async (req: NextRequest, _ctx, { params }) => {
    const { id } = await params;
    return webhookSubscriptionController.listDeliveries(req, id);
  },
  { permission: Permission.WEBHOOK_VIEW }
);