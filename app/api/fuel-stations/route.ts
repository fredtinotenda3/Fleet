// app/api/fuel-stations/route.ts

import { NextRequest } from 'next/server';
import { fuelStationController } from '@/modules/fuel-stations/controllers/fuel-station.controller';

export async function GET(req: NextRequest) {
  return fuelStationController.list(req);
}

export async function POST(req: NextRequest) {
  return fuelStationController.create(req);
}