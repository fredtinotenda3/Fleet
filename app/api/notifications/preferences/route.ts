// app/api/notifications/preferences/route.ts
//
// FIX (🔴 Critical — no auth of any kind): same class of bug as
// app/api/notifications/route.ts. See that file's comment.

import { NextRequest } from 'next/server';
import { notificationController } from '@/modules/notifications/controllers/notification.controller';
import { withAuth } from '@/server/middleware/with-auth';

export const GET = withAuth((req: NextRequest) => notificationController.getPreferences(req));
export const PUT = withAuth((req: NextRequest) => notificationController.updatePreferences(req));