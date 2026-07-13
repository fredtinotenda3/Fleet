// app/api/notifications/[id]/route.ts
//
// FIX (🔴 Critical — no auth of any kind): same class of bug as
// app/api/notifications/route.ts — this one additionally lets an
// unauthenticated caller mark any notification (by guessing/enumerating
// IDs) as read. See app/api/notifications/route.ts's comment.

import { NextRequest } from 'next/server';
import { notificationController } from '@/modules/notifications/controllers/notification.controller';
import { withAuth } from '@/server/middleware/with-auth';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const PUT = withAuth<RouteParams>(async (req: NextRequest, _ctx, { params }) => {
  const { id } = await params;
  return notificationController.markAsRead(req, id);
});