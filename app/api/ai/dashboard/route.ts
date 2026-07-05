// app/api/ai/dashboard/route.ts

import { NextRequest } from 'next/server';
import { aiController } from '@/modules/ai/controllers/ai.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth(
  (req: NextRequest) => aiController.getAIDashboard(req),
  { permission: Permission.ANALYTICS_VIEW }
);