// app/api/ai/dashboard/route.ts

import { NextRequest } from 'next/server';
import { aiController } from '@/modules/ai/controllers/ai.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

// Fixes: even after the batching fix above brings typical response time
// down to a few seconds, telematics fan-out (Promise.all across all
// vehicles) can still spike on a cold Lambda / slow Atlas region. This
// gives headroom on Vercel Pro (Hobby caps at 10s regardless of this
// value -- see note in vercel.json below).
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export const GET = withAuth(
  (req: NextRequest) => aiController.getAIDashboard(req),
  { permission: Permission.ANALYTICS_VIEW }
);