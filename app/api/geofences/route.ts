// app/api/geofences/route.ts

import { NextRequest } from 'next/server';
import { telematicsController } from '@/modules/telematics/controllers/telematics.controller';

export async function GET(req: NextRequest) {
  return telematicsController.listGeofences(req);
}

export async function POST(req: NextRequest) {
  return telematicsController.createGeofence(req);
}