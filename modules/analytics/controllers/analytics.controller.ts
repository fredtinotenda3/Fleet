// modules/analytics/controllers/analytics.controller.ts

import { NextRequest } from 'next/server';
import { fleetAnalyticsService } from '../services/fleet-analytics.service';
import { successResponse, errorResponse } from '@/server/utils/response.utils';
import { AppError } from '@/server/errors/app.errors';
import { getTenantFromRequest } from '@/server/utils/context.utils';
import { DateRange } from '@/shared/types/common.types';

export class AnalyticsController {
  async handle(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const action = req.nextUrl.searchParams.get('action') || 'kpis';
      const startDate = req.nextUrl.searchParams.get('startDate');
      const endDate = req.nextUrl.searchParams.get('endDate');
      const months = parseInt(req.nextUrl.searchParams.get('months') || '6', 10);

      const dateRange: DateRange | undefined = startDate && endDate
        ? { startDate: new Date(startDate), endDate: new Date(endDate) }
        : undefined;

      switch (action) {
        case 'kpis':
          return successResponse(
            await fleetAnalyticsService.getFleetKPIs(tenantId, dateRange)
          );

        case 'metrics':
          if (!dateRange) {
            return errorResponse(
              'startDate and endDate are required for metrics',
              'VALIDATION_ERROR',
              400
            );
          }
          return successResponse(
            await fleetAnalyticsService.getOperationalMetrics(tenantId, dateRange)
          );

        case 'cost-breakdown':
          if (!dateRange) {
            return errorResponse(
              'startDate and endDate are required for cost breakdown',
              'VALIDATION_ERROR',
              400
            );
          }
          return successResponse(
            await fleetAnalyticsService.getCostBreakdown(tenantId, dateRange)
          );

        case 'fuel-efficiency':
          return successResponse(
            await fleetAnalyticsService.getFuelEfficiencyTrend(tenantId, months)
          );

        case 'maintenance-forecast':
          return successResponse(
            await fleetAnalyticsService.getMaintenanceForecast(tenantId)
          );

        default:
          return errorResponse(
            `Unknown action: ${action}`,
            'INVALID_ACTION',
            400
          );
      }
    } catch (error) {
      return this.handleError(error);
    }
  }

  private handleError(error: unknown) {
    if (error instanceof AppError) {
      return errorResponse(error.message, error.code, error.statusCode);
    }
    console.error('[AnalyticsController] Unexpected error:', error);
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

export const analyticsController = new AnalyticsController();