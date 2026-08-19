// app/api/attention/ledger/summary/route.ts

import { NextRequest } from 'next/server';
import { ledgerSummaryController } from '@/modules/attention/controllers/ledger-summary.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const dynamic = 'force-dynamic';

export const GET = withAuth(
  (req: NextRequest) => ledgerSummaryController.getSummary(req),
  { permission: Permission.FINANCE_VIEW }
);
