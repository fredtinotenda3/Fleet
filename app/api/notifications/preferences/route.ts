// app/api/notifications/preferences/route.ts

import { NextRequest } from 'next/server';
import { notificationController } from '@/modules/notifications/controllers/notification.controller';

export async function GET(req: NextRequest) {
  return notificationController.getPreferences(req);
}

export async function PUT(req: NextRequest) {
  return notificationController.updatePreferences(req);
}