// app/api/fuel-stations/[id]/route.ts

import { NextRequest } from 'next/server';
import { fuelStationController } from '@/modules/fuel-stations/controllers/fuel-station.controller';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return fuelStationController.getById(req, id);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return fuelStationController.update(req, id);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return fuelStationController.remove(req, id);
}