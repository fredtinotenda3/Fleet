// app/api/fuellogs/[id]/ledger-reconciliation/route.ts
//
// MODULE CONNECTIVITY UPGRADE (fuel/GL reconciliation gap). Whether one
// fuel log's cost actually reached the allocation ledger, and whether
// it still agrees with what's posted. Gated on FINANCE_VIEW (not the
// broader FUEL_VIEW the rest of /api/fuellogs uses) -- this surfaces a
// ledger posting amount and account code, the same financial-access
// bar GLReconciliationPage itself uses, not merely fuel-log visibility.

import { NextRequest } from 'next/server';
import { fuelController } from '@/modules/fuel/controllers/fuel.controller';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';

type Ctx = { params: Promise<{ id: string }> };

export const GET = withAuth<Ctx>(
  async (req: NextRequest, _context, { params }) => {
    const { id } = await params;
    return fuelController.getFuelLogLedgerReconciliation(req, id);
  },
  { permission: Permission.FINANCE_VIEW }
);
