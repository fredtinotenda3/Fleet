// app/api/telematics/alerts/[alertId]/acknowledge/route.ts

import { NextRequest } from 'next/server';
import { telematicsController } from '@/modules/telematics/controllers/telematics.controller';

interface RouteParams {
  params: Promise<{ alertId: string }>;
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  const { alertId } = await params;
  return telematicsController.acknowledgeAlert(req, alertId);
}