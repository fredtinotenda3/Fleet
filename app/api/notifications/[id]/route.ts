// app/api/notifications/[id]/route.ts

import { NextRequest } from 'next/server';
import { notificationController } from '@/modules/notifications/controllers/notification.controller';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  return notificationController.markAsRead(req, id);
}