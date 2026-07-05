// app/api/telematics/vehicles/[vehicleId]/alerts/route.ts

import { NextRequest } from 'next/server';
import { telematicsController } from '@/modules/telematics/controllers/telematics.controller';

interface RouteParams {
  params: Promise<{ vehicleId: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const { vehicleId } = await params;
  return telematicsController.getActiveAlerts(req, vehicleId);
}