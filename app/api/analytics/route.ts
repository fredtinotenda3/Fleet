// app/api/analytics/route.ts

import { analyticsController } from '@/modules/analytics/controllers/analytics.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth(
  (req) => analyticsController.handle(req),
  { permission: Permission.ANALYTICS_VIEW }
);