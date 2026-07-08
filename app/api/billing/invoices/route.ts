// app/api/billing/invoices/route.ts

import { NextRequest } from 'next/server';
import { billingController } from '@/modules/billing/controllers/billing.controller';
import { withAuth } from '@/server/middleware/with-auth';

export const GET = withAuth(
  (req: NextRequest) => billingController.listInvoices(req)
);