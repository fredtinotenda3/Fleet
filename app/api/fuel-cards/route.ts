// app/api/fuel-cards/route.ts

import { NextRequest } from 'next/server';
import { fuelCardController } from '@/modules/fuel-cards/controllers/fuel-card.controller';

export async function GET(req: NextRequest) {
  return fuelCardController.list(req);
}

export async function POST(req: NextRequest) {
  return fuelCardController.create(req);
}