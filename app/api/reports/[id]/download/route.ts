// app/api/reports/[id]/download/route.ts

import { NextRequest } from 'next/server';
import { reportController } from '@/modules/reports/controllers/report.controller';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  return reportController.downloadReport(req, id);
}