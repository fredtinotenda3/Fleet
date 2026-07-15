 //app/api/fuellogs/route.ts
//
// FIX (High -- duplicate auth strategies): this route used the legacy
// requireAuth() helper, which only proves a session exists and does not
// enforce permission checks. Every other mature module (expenses,
// maintenance, bookings, etc.) is gated with withAuth + Permission.
// Converted to match that convention.
//
// Permission.FUEL_VIEW / FUEL_CREATE / FUEL_EDIT / FUEL_DELETE
// confirmed against server/permissions/roles.ts.
//
// NEW: `action=by-driver` routes to the driver-consumption analytics
// endpoint (GET /api/fuellogs?action=by-driver), same pattern as the
// existing stats/kpis/abnormal/monthly/top-consumers actions.

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