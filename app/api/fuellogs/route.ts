// app/api/fuellogs/route.ts

import { NextRequest } from 'next/server';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';
import { fuelController } from '@/modules/fuel/controllers/fuel.controller';
import { errorResponse } from '@/server/utils/response.utils';

export const GET = withAuth(
  async (req: NextRequest) => {
    const searchParams = req.nextUrl.searchParams;
    const action = searchParams.get('action');
    const id = searchParams.get('id');

    if (action === 'stats') return fuelController.getFuelStats(req);
    if (action === 'kpis') return fuelController.getFuelKpis(req);
    if (action === 'abnormal') return fuelController.getAbnormalConsumption(req);
    if (action === 'monthly') return fuelController.getMonthlyConsumption(req);
    if (action === 'top-consumers') return fuelController.getTopConsumers(req);
    if (action === 'by-driver') return fuelController.getFuelByDriver(req);

    // NEW -- enterprise Fuel Analytics Enhancement
    if (action === 'vehicle-timeline') return fuelController.getVehicleFuelTimeline(req);
    if (action === 'by-station') return fuelController.getFuelByStation(req);
    if (action === 'activity-trend') return fuelController.getFuelActivityTrend(req);
    if (action === 'price-trend') return fuelController.getAverageFuelPriceTrend(req);
    if (action === 'type-distribution') return fuelController.getFuelTypeDistribution(req);
    if (action === 'frequency-by-vehicle') return fuelController.getFuelingFrequencyByVehicle(req);
    if (action === 'cost-distribution') return fuelController.getFuelCostDistribution(req);
    if (action === 'heatmap') return fuelController.getFuelEntryHeatmap(req);

    if (id) return fuelController.getFuelLog(req, id);

    return fuelController.getFuelLogs(req);
  },
  { permission: Permission.FUEL_VIEW }
);

export const POST = withAuth(
  async (req: NextRequest) => fuelController.createFuelLog(req),
  { permission: Permission.FUEL_CREATE }
);

export const PUT = withAuth(
  async (req: NextRequest) => {
    const id = req.nextUrl.searchParams.get('id');
    if (!id) {
      return errorResponse('Missing fuel log ID', 'VALIDATION_ERROR', 400);
    }
    return fuelController.updateFuelLog(req, id);
  },
  { permission: Permission.FUEL_EDIT }
);

export const DELETE = withAuth(
  async (req: NextRequest) => {
    const id = req.nextUrl.searchParams.get('id');
    if (!id) {
      return errorResponse('Missing fuel log ID', 'VALIDATION_ERROR', 400);
    }
    return fuelController.deleteFuelLog(req, id);
  },
  { permission: Permission.FUEL_DELETE }
);