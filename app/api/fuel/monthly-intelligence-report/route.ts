// app/api/fuel/monthly-intelligence-report/route.ts
//
// GET /api/fuel/monthly-intelligence-report?month=YYYY-MM&format=json|excel|pdf
//
// PART 5-8. Gated on Permission.ANALYTICS_EXPORT, matching
// app/api/esg/export/route.ts's precedent for a single endpoint that
// returns either an on-screen JSON payload or a downloadable file of
// the same underlying report.

import { NextRequest } from 'next/server';
import { fuelIntelligenceController } from '@/modules/fuel/controllers/fuel-intelligence.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const dynamic = 'force-dynamic';

export const GET = withAuth(
  (req: NextRequest) => fuelIntelligenceController.getMonthlyReport(req),
  { permission: Permission.ANALYTICS_EXPORT }
);
