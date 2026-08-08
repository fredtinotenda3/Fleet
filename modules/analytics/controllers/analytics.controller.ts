// modules/analytics/controllers/analytics.controller.ts

import { NextRequest } from 'next/server';
import { fleetAnalyticsService } from '../services/fleet-analytics.service';
import { successResponse, errorResponse } from '@/server/utils/response.utils';
import { AppError, isAppError, describeError } from '@/server/errors/app.errors';
import { resolveTenantContext } from '@/server/utils/tenant-context.utils';
import { DateRange } from '@/shared/types/common.types';

export class AnalyticsController {
  async handle(req: NextRequest) {
    try {
      /**
       * LEAK FIX. This controller drove every dashboard KPI, the expense
       * breakdown chart, the fuel-efficiency trend and the maintenance
       * forecast, and it resolved only a tenantId -- so a branch manager
       * saw organization-wide totals on every widget.
       */
      const context = await resolveTenantContext(req);
      const tenantId = context.organizationId;
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
            await fleetAnalyticsService.getFleetKPIs(tenantId, dateRange, context)
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
            await fleetAnalyticsService.getOperationalMetrics(tenantId, dateRange, context)
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
            await fleetAnalyticsService.getCostBreakdown(tenantId, dateRange, context)
          );

        case 'fuel-efficiency':
          return successResponse(
            await fleetAnalyticsService.getFuelEfficiencyTrend(tenantId, context, months)
          );

        case 'maintenance-forecast':
          return successResponse(
            await fleetAnalyticsService.getMaintenanceForecast(tenantId, context)
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
    if (isAppError(error)) {
      return errorResponse(error.message, error.code, error.statusCode);
    }
    console.error('[AnalyticsController] Unexpected error:', describeError(error));
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

export const analyticsController = new AnalyticsController();