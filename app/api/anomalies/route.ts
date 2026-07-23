// app/api/anomalies/route.ts

import { NextRequest } from 'next/server';
import { anomalyController } from '@/modules/intelligence/controllers/anomaly.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth(
  (req: NextRequest) => anomalyController.list(req),
  { permission: Permission.ANALYTICS_VIEW }
);