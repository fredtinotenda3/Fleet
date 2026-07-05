// app/api/billing/invoices/[id]/status/route.ts

import { NextRequest } from 'next/server';
import { billingController } from '@/modules/billing/controllers/billing.controller';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  return billingController.checkInvoiceStatus(req, id);
}