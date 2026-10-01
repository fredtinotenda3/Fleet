// app/api/notifications/route.ts
//
// FIX (🔴 Critical — no auth of any kind): this route had no auth
// wrapper. Notifications are per-user personal data; without a session
// check the underlying controller has no legitimate way to know whose
// notifications to return, meaning this either 500s for everyone or
// (worse, if the controller has any fallback/default user path) leaks
// one user's notifications to another. No dedicated permission exists
// for notifications (self-service, scoped to the caller) so this uses
// withAuth() with no permission — matches the pattern used for
// app/api/security/sessions/route.ts and app/api/security/mfa/*.

import { NextRequest } from 'next/server';
import { notificationController } from '@/modules/notifications/controllers/notification.controller';
import { withAuth } from '@/server/middleware/with-auth';

export const GET = withAuth((req: NextRequest) => notificationController.getNotifications(req));
export const PUT = withAuth((req: NextRequest) => notificationController.markAllAsRead(req));