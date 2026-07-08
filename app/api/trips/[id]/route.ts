// app/api/trips/[id]/route.ts

import { NextRequest } from 'next/server';
import { tripController } from '@/modules/trips/controllers/trip.controller';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  return tripController.getTrip(req, id);
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  return tripController.updateTrip(req, id);
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  return tripController.deleteTrip(req, id);
}