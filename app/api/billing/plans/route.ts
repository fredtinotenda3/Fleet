// app/api/billing/plans/route.ts

import { billingController } from '@/modules/billing/controllers/billing.controller';

export async function GET() {
  return billingController.getPlans();
}