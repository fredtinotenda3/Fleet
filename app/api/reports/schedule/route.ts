// app/api/reports/schedule/route.ts

import { NextRequest } from 'next/server';
import { reportController } from '@/modules/reports/controllers/report.controller';

export async function POST(req: NextRequest) {
  return reportController.scheduleReport(req);
}