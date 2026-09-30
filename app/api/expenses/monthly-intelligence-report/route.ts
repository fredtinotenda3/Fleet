// app/api/expenses/monthly-intelligence-report/route.ts
//
// GET /api/expenses/monthly-intelligence-report?month=YYYY-MM&format=json|excel|pdf
//
// Mirrors app/api/fuel/monthly-intelligence-report/route.ts exactly.
// Gated on Permission.ANALYTICS_EXPORT, the same permission the fuel
// report's equivalent endpoint uses -- this is an analytics/export
// surface, not expense CRUD, so it deliberately does not reuse
// Permission.EXPENSE_VIEW.
//
// BACKEND-ONLY PHASE: "excel" and "pdf" are accepted as valid format
// values but currently return 501 Not Implemented -- see
// expense-intelligence.controller.ts's header for why.

import { NextRequest } from 'next/server';
import { expenseIntelligenceController } from '@/modules/expenses/controllers/expense-intelligence.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const dynamic = 'force-dynamic';

export const GET = withAuth(
  (req: NextRequest) => expenseIntelligenceController.getMonthlyReport(req),
  { permission: Permission.ANALYTICS_EXPORT }
);
