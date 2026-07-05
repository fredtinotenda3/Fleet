// modules/digital-twin/controllers/digital-twin.controller.ts

import { NextRequest } from 'next/server';
import { digitalTwinService } from '../services/digital-twin.service';
import { getTenantFromRequest, getUserIdFromRequest } from '@/server/utils/context.utils';
import { successResponse, paginatedResponse, errorResponse } from '@/server/utils/response.utils';
import { AppError } from '@/server/errors/app.errors';
import { validatePaginationParams } from '@/shared/utils/pagination.utils';
import { DigitalTwinFilters, TwinAlertSeverity } from '../types/digital-twin.types';

export class DigitalTwinController {
  async getTwin(req: NextRequest, vehicleId: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const twin = await digitalTwinService.getTwin(vehicleId, tenantId);
      return successResponse(twin);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async rebuildTwin(req: NextRequest, vehicleId: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const twin = await digitalTwinService.rebuildTwin(vehicleId, tenantId);
      return successResponse(twin);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async acknowledgeAlert(req: NextRequest, vehicleId: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const { alertId } = await req.json();
      if (!alertId) return errorResponse('alertId is required', 'VALIDATION_ERROR', 400);
      await digitalTwinService.acknowledgeAlert(vehicleId, alertId, tenantId);
      return successResponse({ message: 'Alert acknowledged' });
    } catch (error) {
      return this.handleError(error);
    }
  }

  async listTwins(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const searchParams = req.nextUrl.searchParams;
      const { page, limit } = validatePaginationParams(searchParams.get('page'), searchParams.get('limit'));

      const filters: DigitalTwinFilters = {
        status: searchParams.get('status') || undefined,
        hasActiveAlerts: searchParams.get('hasActiveAlerts') === 'true' || undefined,
        minSeverity: (searchParams.get('minSeverity') as TwinAlertSeverity) || undefined,
      };

      const result = await digitalTwinService.listTwins(filters, { page, limit }, tenantId);
      return paginatedResponse(result.data, result.pagination);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getFleetSummary(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const summary = await digitalTwinService.getFleetSummary(tenantId);
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