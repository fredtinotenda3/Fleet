// modules/search/controllers/search.controller.ts

import { NextRequest } from 'next/server';
import { globalSearchService } from '../services/global-search.service';
import { tenantContextService } from '@/modules/tenancy/services/tenant-context.service';
import { getAuthContext } from '@/server/auth/auth-context';
import { successResponse, errorResponse } from '@/server/utils/response.utils';
import { UnauthorizedError, isAppError, describeError } from '@/server/errors/app.errors';

export class SearchController {
  /**
   * GET /api/search?q=...
   *
   * Deliberately carries NO permission of its own on the route. That is
   * not a gap: the service checks a permission per source before it
   * queries, and a single route-level permission would either be too
   * narrow (a driver could not search vehicles they are allowed to see)
   * or too wide (one permission would unlock six collections).
   *
   * `route-auth-conformance.spec.ts` requires every route to be
   * authenticated, which `withAuth` provides, and
   * `global-search-scope.spec.ts` asserts the per-source gating.
   */
  async search(req: NextRequest) {
    try {
      const authContext = await getAuthContext(req);
      if (!authContext) throw new UnauthorizedError('Authentication required');

      const context = await tenantContextService.resolveContext(
        authContext.userId,
        authContext.tenantId,
        authContext.roles,
        authContext.isPlatformAdmin,
        authContext.orgUnitId
      );

      const result = await globalSearchService.search(
        req.nextUrl.searchParams.get('q') ?? '',
        context,
        authContext.roles
      );

      return successResponse(result);
    } catch (error) {
      if (isAppError(error)) {
        return errorResponse(error.message, error.code, error.statusCode, error.details);
      }
      console.error('[SearchController] Unexpected error:', describeError(error));
      return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
    }
  }
}

export const searchController = new SearchController();
