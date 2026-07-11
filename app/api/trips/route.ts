// app/api/trips/route.ts

import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/requireAuth';
import { tripController } from '@/modules/trips/controllers/trip.controller';

export async function GET(req: NextRequest) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  return tripController.getTrips(req);
}

export async function POST(req: NextRequest) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  return tripController.createTrip(req);
}