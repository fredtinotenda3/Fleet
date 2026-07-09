// app/api/fuellogs/route.ts

import { NextRequest } from 'next/server';
import { fuelController } from '@/modules/fuel/controllers/fuel.controller';

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const action = searchParams.get('action');
  const id = searchParams.get('id');

  if (action === 'stats') return fuelController.getFuelStats(req);
  if (action === 'kpis') return fuelController.getFuelKpis(req);
  if (action === 'abnormal') return fuelController.getAbnormalConsumption(req);
  if (action === 'monthly') return fuelController.getMonthlyConsumption(req);
  if (action === 'top-consumers') return fuelController.getTopConsumers(req);
  if (id) return fuelController.getFuelLog(req, id);

  return fuelController.getFuelLogs(req);
}

export async function POST(req: NextRequest) {
  return fuelController.createFuelLog(req);
}

export async function PUT(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) {
    const { errorResponse } = await import('@/server/utils/response.utils');
    return errorResponse('Missing fuel log ID', 'VALIDATION_ERROR', 400);
  }
  return fuelController.updateFuelLog(req, id);
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) {
    const { errorResponse } = await import('@/server/utils/response.utils');
    return errorResponse('Missing fuel log ID', 'VALIDATION_ERROR', 400);
  }
  return fuelController.deleteFuelLog(req, id);
}