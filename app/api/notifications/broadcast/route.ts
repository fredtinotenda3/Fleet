// app/api/notifications/broadcast/route.ts
//
// FIX (Phase C -- notifications hierarchy filtering): creates an
// org-unit-scoped broadcast notification. withAuth() establishes who
// the caller is (authentication); NotificationController.createBroadcast
// then calls authorizeBroadcast() (authorization: role gate + resolved-
// scope check against the requested orgUnitId) before touching the
// database. See modules/notifications/authorization/
// notification-broadcast.authorization.ts for the full rationale and
// modules/notifications/authorization/__tests__/ for the scenarios
// proving a manager cannot broadcast outside their own hierarchy.

import { NextRequest } from 'next/server';
import { notificationController } from '@/modules/notifications/controllers/notification.controller';
import { withAuth } from '@/server/middleware/with-auth';

export const POST = withAuth((req: NextRequest) => notificationController.createBroadcast(req));