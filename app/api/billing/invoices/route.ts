// app/api/billing/invoices/route.ts

import { NextRequest } from 'next/server';
import { billingController } from '@/modules/billing/controllers/billing.controller';

export async function GET(req: NextRequest) {
  return billingController.listInvoices(req);
}