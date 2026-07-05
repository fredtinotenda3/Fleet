// app/api/notifications/unread-count/route.ts

import { NextRequest } from 'next/server';
import { notificationController } from '@/modules/notifications/controllers/notification.controller';

export async function GET(req: NextRequest) {
  return notificationController.getUnreadCount(req);
}