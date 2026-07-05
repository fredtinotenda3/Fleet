// app/api/reports/route.ts

import { NextRequest } from 'next/server';
import { reportController } from '@/modules/reports/controllers/report.controller';

export async function GET(req: NextRequest) {
  return reportController.listReports(req);
}

export async function POST(req: NextRequest) {
  return reportController.createReport(req);
}