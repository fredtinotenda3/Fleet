// app/api/notifications/route.ts

import { NextRequest } from 'next/server';
import { notificationController } from '@/modules/notifications/controllers/notification.controller';

export async function GET(req: NextRequest) {
  return notificationController.getNotifications(req);
}

export async function PUT(req: NextRequest) {
  return notificationController.markAllAsRead(req);
}