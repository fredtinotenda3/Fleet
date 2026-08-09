// modules/telematics/controllers/live-map.controller.ts

import { NextRequest } from 'next/server';
import { liveMapService } from '../services/live-map.service';
import { successResponse } from '@/server/utils/response.utils';
import { resolveTenantContext } from '@/server/utils/tenant-context.utils';
import { handleTelematicsError } from './telematics-error.utils';

export class LiveMapController {
  /**
   * GET /api/telematics/live-map
   *
   * Every vehicle the caller may see (org-unit scoped via
   * resolveTenantContext -- the same helper every other scoped
   * controller in the product uses), each with its current position
   * (real, from Cartrack, or simulated, when Demo Mode is on for this
   * tenant), plus the geofences visible to the caller.
   */
  async getLiveMap(req: NextRequest) {
    try {
      const context = await resolveTenantContext(req);
      const payload = await liveMapService.getLiveMapData(context);
      return successResponse(payload);
    } catch (error) {
      return handleTelematicsError('LiveMapController', error);
    }
  }

  /**
   * GET /api/telematics/live-map/history/[vehicleId]
   *
   * Org-unit-scoped route trail for one vehicle (see
   * LiveMapService.getVehicleRouteHistory for the scoping argument).
   * Accepts an optional `?minutes=` lookback, defaulting/clamping inside
   * the service so this controller doesn't have to duplicate the limits.
   */
  async getRouteHistory(req: NextRequest, vehicleId: string) {
    try {
      const context = await resolveTenantContext(req);
      const minutesParam = req.nextUrl.searchParams.get('minutes');
      const parsedMinutes = minutesParam ? Number(minutesParam) : NaN;
      const minutes = Number.isFinite(parsedMinutes) ? parsedMinutes : undefined;
      const history = await liveMapService.getVehicleRouteHistory(vehicleId, context, minutes);
      return successResponse(history);
    } catch (error) {
      return handleTelematicsError('LiveMapController', error);
    }
  }
}

export const liveMapController = new LiveMapController();