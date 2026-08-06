// modules/digital-twin/controllers/digital-twin.controller.ts

import { NextRequest } from 'next/server';
import { digitalTwinService } from '../services/digital-twin.service';
import { successResponse, paginatedResponse, errorResponse } from '@/server/utils/response.utils';
import { AppError } from '@/server/errors/app.errors';
import { validatePaginationParams } from '@/shared/utils/pagination.utils';
import { DigitalTwinFilters, TwinAlertSeverity } from '../types/digital-twin.types';
import { resolveTenantContext } from '@/server/utils/tenant-context.utils';

export class DigitalTwinController {
  async getTwin(req: NextRequest, vehicleId: string) {
    try {
      const context = await resolveTenantContext(req);
      const twin = await digitalTwinService.getTwinInScope(vehicleId, context);
      return successResponse(twin);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async rebuildTwin(req: NextRequest, vehicleId: string) {
    try {
      /**
       * A rebuild is a WRITE, so scope is checked before it runs rather
       * than filtering its result afterwards. getTwinInScope throws 404
       * for a vehicle outside the caller's units, which stops an
       * out-of-scope rebuild from materialising a twin the caller may
       * not read.
       *
       * A twin that does not exist yet is a legitimate first-build, so
       * the pre-check is skipped for org-wide callers only (they can see
       * every unit anyway) -- a scoped caller must have a visible twin.
       */
      const context = await resolveTenantContext(req);
      if (context.accessibleOrgUnitIds !== null) {
        await digitalTwinService.getTwinInScope(vehicleId, context);
      }
      const twin = await digitalTwinService.rebuildTwin(vehicleId, context.organizationId);
      return successResponse(twin);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async acknowledgeAlert(req: NextRequest, vehicleId: string) {
    try {
      const context = await resolveTenantContext(req);
      const { alertId } = await req.json();
      if (!alertId) return errorResponse('alertId is required', 'VALIDATION_ERROR', 400);
      // Scope gate before the mutation, same rationale as rebuildTwin.
      if (context.accessibleOrgUnitIds !== null) {
        await digitalTwinService.getTwinInScope(vehicleId, context);
      }
      await digitalTwinService.acknowledgeAlert(vehicleId, alertId, context.organizationId);
      return successResponse({ message: 'Alert acknowledged' });
    } catch (error) {
      return this.handleError(error);
    }
  }

  async listTwins(req: NextRequest) {
    try {
      const context = await resolveTenantContext(req);
      const searchParams = req.nextUrl.searchParams;
      const { page, limit } = validatePaginationParams(searchParams.get('page'), searchParams.get('limit'));

      const filters: DigitalTwinFilters = {
        status: searchParams.get('status') || undefined,
        hasActiveAlerts: searchParams.get('hasActiveAlerts') === 'true' || undefined,
        minSeverity: (searchParams.get('minSeverity') as TwinAlertSeverity) || undefined,
      };

      const result = await digitalTwinService.listTwinsInScope(filters, { page, limit }, context);
      return paginatedResponse(result.data, result.pagination);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getFleetSummary(req: NextRequest) {
    try {
      /**
       * The aggregate, scoped. This is the trap the original five modules
       * fell into: list endpoint filtered, aggregate not. An aggregate
       * leaks counts rather than rows -- quieter, still a disclosure. A
       * branch manager should not learn the size of the whole fleet.
       */
      const context = await resolveTenantContext(req);
      const summary = await digitalTwinService.getFleetSummaryInScope(context);
      return successResponse(summary);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private handleError(error: unknown) {
    if (error instanceof AppError) {
      return errorResponse(error.message, error.code, error.statusCode, error.details);
    }
    console.error('[DigitalTwinController] Unexpected error:', error);
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

export const digitalTwinController = new DigitalTwinController();