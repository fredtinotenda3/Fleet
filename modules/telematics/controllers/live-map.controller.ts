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
}

export const liveMapController = new LiveMapController();