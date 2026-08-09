// app/api/attention/ledger/export/route.ts

import { NextRequest } from 'next/server';
import { ledgerExportController } from '@/modules/attention/controllers/ledger-export.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

export const dynamic = 'force-dynamic';

export const GET = withAuth(
  (req: NextRequest) => ledgerExportController.exportLedger(req),
  { permission: Permission.ANALYTICS_EXPORT }
);
