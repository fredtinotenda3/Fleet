// app/api/platform/stats/route.ts

import { NextRequest } from 'next/server';
import { platformController } from '@/modules/tenancy/controllers/platform.controller';

export async function GET(req: NextRequest) {
  return platformController.getStats(req);
}