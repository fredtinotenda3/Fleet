// app/api/analytics/route.ts

import { analyticsController } from '@/modules/analytics/controllers/analytics.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth(
  // WAVE 3, R.3.1: AuthContext is now threaded through so the controller
  // can gate financial fields on EXPENSE_VIEW/FUEL_VIEW/FINANCE_VIEW,
  // in addition to the route-level ANALYTICS_VIEW check below.
  (req, context) => analyticsController.handle(req, context),
  { permission: Permission.ANALYTICS_VIEW }
);