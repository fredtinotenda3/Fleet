// app/api/geofences/[id]/route.ts

import { NextRequest } from 'next/server';
import { telematicsController } from '@/modules/telematics/controllers/telematics.controller';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  return telematicsController.updateGeofence(req, id);
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  return telematicsController.deleteGeofence(req, id);
}