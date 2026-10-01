// modules/telematics/controllers/geocoding.controller.ts
//
// PART 3: "Type/search for a location. Select a geocoded result." --
// the controller behind the map-assisted trip log's location search box.
//
// Authenticated (tenant-scoped cache, see geocoding-search.service.ts)
// but not vehicle- or org-unit-scoped: a place-name search is not a
// read of any tenant's fleet data, so TRIP_CREATE is enough -- the same
// permission needed to actually use the result in a trip.

import { NextRequest } from 'next/server';
import { resolveTenantContext } from '@/server/utils/tenant-context.utils';
import { geocodingSearchService } from '../services/geocoding-search.service';
import { successResponse, errorResponse } from '@/server/utils/response.utils';
import { isAppError, describeError } from '@/server/errors/app.errors';

export class GeocodingController {
  async search(req: NextRequest) {
    try {
      const context = await resolveTenantContext(req);
      const query = req.nextUrl.searchParams.get('q') ?? '';

      const result = await geocodingSearchService.search(query, context.organizationId);
      return successResponse(result);
    } catch (error) {
      if (isAppError(error)) {
        return errorResponse(error.message, error.code, error.statusCode);
      }
      console.error('[GeocodingController] Unexpected error:', describeError(error));
      return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
    }
  }
}

export const geocodingController = new GeocodingController();
