// app/api/finance/gl/reconciliation/route.ts

import { NextRequest } from 'next/server';
import { glReconciliationController } from '@/modules/finance/controllers/gl-reconciliation.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const dynamic = 'force-dynamic';

export const GET = withAuth(
  (req: NextRequest) => glReconciliationController.getReport(req),
  { permission: Permission.FINANCE_VIEW }
);
