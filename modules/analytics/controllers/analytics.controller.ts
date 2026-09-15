// modules/analytics/controllers/analytics.controller.ts

import { NextRequest } from 'next/server';
import { fleetAnalyticsService } from '../services/fleet-analytics.service';
import { successResponse, errorResponse } from '@/server/utils/response.utils';
import { AppError, isAppError, describeError } from '@/server/errors/app.errors';
import { resolveTenantContext } from '@/server/utils/tenant-context.utils';
import { DateRange } from '@/shared/types/common.types';
import { AuthContext, hasAnyPermission } from '@/server/auth/auth-context';
import { Permission } from '@/server/permissions/roles';

export class AnalyticsController {
  /**
   * WAVE 3, R.3.1 FIX -- role/permission gap on the Fleet Summary source.
   *
   * This route is gated only by ANALYTICS_VIEW (see app/api/analytics/
   * route.ts), which several roles hold without holding EXPENSE_VIEW or
   * FUEL_VIEW (WORKSHOP_MANAGER is the concrete case in
   * server/permissions/roles.ts: ANALYTICS_VIEW + REPORT_VIEW, neither
   * EXPENSE_VIEW nor FUEL_VIEW). The 'kpis' action returned raw
   * totalExpenses/totalFuelCost/costPerKm to every such caller with no
   * field-level check at all -- a frontend-only omission would not have
   * closed this (the master prompt's own rule: authorization must be
   * server-side), and the data must never leave this handler in the first
   * place. `authContext` (the second argument withAuth already threads to
   * every handler; this controller simply never accepted it before) is
   * what makes that check possible.
   *
   * The 'metrics' and 'cost-breakdown' actions return comparable financial
   * figures (averageDailyExpense/averageCostPerVehicle, cost-by-category)
   * and have the identical gap, but their only caller
   * (AnalyticsOverview.tsx) is confirmed dead code with zero importers --
   * out of R.3.1's scope (Fleet Summary, i.e. ExecutiveDashboard.tsx /
   * getFleetKPIs) and left unchanged here. See the R.3.1 handoff report,
   * "Known Limitations".
   */
  async handle(req: NextRequest, authContext: AuthContext) {
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
        case 'kpis': {
          const hasFinancialAccess = hasAnyPermission(authContext, [
            Permission.EXPENSE_VIEW,
            Permission.FUEL_VIEW,
            Permission.FINANCE_VIEW,
          ]);
          return successResponse(
            await fleetAnalyticsService.getFleetKPIs(tenantId, dateRange, context, hasFinancialAccess)
          );
        }

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