// app/api/webhooks/subscriptions/[id]/route.ts

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
    return webhookSubscriptionController.get(req, id);
  },
  { permission: Permission.WEBHOOK_VIEW }
);

export const PUT = withAuth<RouteParams>(
  async (req: NextRequest, _ctx, { params }) => {
    const { id } = await params;
    return webhookSubscriptionController.update(req, id);
  },
  { permission: Permission.WEBHOOK_MANAGE }
);

export const DELETE = withAuth<RouteParams>(
  async (req: NextRequest, _ctx, { params }) => {
    const { id } = await params;
    return webhookSubscriptionController.delete(req, id);
  },
  { permission: Permission.WEBHOOK_MANAGE }
);