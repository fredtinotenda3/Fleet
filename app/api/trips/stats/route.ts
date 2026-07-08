// app/api/trips/stats/route.ts

import { NextRequest } from 'next/server';
import { tripController } from '@/modules/trips/controllers/trip.controller';

export async function GET(req: NextRequest) {
  return tripController.getTripStats(req);
}