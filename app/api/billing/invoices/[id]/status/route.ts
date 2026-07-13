// app/api/billing/invoices/[id]/status/route.ts
//
// FIX (🔴 Critical — no auth of any kind): this route had no auth
// wrapper at all, inconsistent with its sibling
// app/api/billing/invoices/route.ts (GET, which does use withAuth).
// Invoice status includes payment/financial data. No specific
// permission is required here (matches the sibling route, which also
// gates on session only) since billingController.checkInvoiceStatus
// already scopes by the caller's tenantId internally.

import { NextRequest } from 'next/server';
import { billingController } from '@/modules/billing/controllers/billing.controller';
import { withAuth } from '@/server/middleware/with-auth';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const GET = withAuth<RouteParams>(async (req: NextRequest, _ctx, { params }) => {
  const { id } = await params;
  return billingController.checkInvoiceStatus(req, id);
});