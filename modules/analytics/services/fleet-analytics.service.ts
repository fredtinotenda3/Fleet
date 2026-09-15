// modules/analytics/services/fleet-analytics.service.ts

import { TenantContext } from '@/modules/tenancy/services/tenant-context.service';
import { vehicleRepository } from '@/modules/vehicles/repositories/vehicle.repository';
import { expenseRepository } from '@/modules/expenses/repositories/expense.repository';
import { fuelRepository } from '@/modules/fuel/repositories/fuel.repository';
import { maintenanceRepository } from '@/modules/maintenance/repositories/maintenance.repository';
import { tripRepository } from '@/modules/trips/repositories/trip.repository';
import { DateRange } from '@/shared/types/common.types';

export interface FleetKPIs {
  totalVehicles: number;
  activeVehicles: number;
  maintenanceVehicles: number;
  /** `null` when the caller lacks financial view access -- see `financialAccessRestricted`. */
  totalExpenses: number | null;
  /** `null` when the caller lacks financial view access -- see `financialAccessRestricted`. */
  totalFuelCost: number | null;
  totalFuelVolume: number;
  totalDistance: number;
  averageFuelEfficiency: number | null;
  /** `null` either because there is no distance to divide by, or because the caller lacks financial view access -- see `financialAccessRestricted`. */
  costPerKm: number | null;
  pendingMaintenance: number;
  overdueMaintenance: number;
  /**
   * WAVE 3, R.3.1. True when totalExpenses/totalFuelCost/costPerKm were
   * withheld because the caller has ANALYTICS_VIEW (required to reach this
   * endpoint at all) but none of EXPENSE_VIEW/FUEL_VIEW/FINANCE_VIEW.
   * WORKSHOP_MANAGER is the concrete role this protects today: it holds
   * ANALYTICS_VIEW + REPORT_VIEW (so it can reach the Executive Dashboard
   * and this endpoint) but neither EXPENSE_VIEW nor FUEL_VIEW. Distinguishes
   * "not permitted to see this figure" from "figure is genuinely zero/
   * unavailable" -- collapsing the two would misreport a real cost as "no
   * cost" to a role that simply isn't authorized to see it. The frontend
   * must render this as "Restricted", never as 0 or "N/A".
   */
  financialAccessRestricted: boolean;
}

export interface OperationalMetrics {
  averageDailyDistance: number;
  averageDailyExpense: number;
  /** `null` when the organisation has no vehicles -- a per-vehicle cost over zero vehicles is undefined, not 0. */
  averageCostPerVehicle: number | null;
  /** `null` when the organisation has no vehicles. */
  vehicleUtilizationRate: number | null;
  /** `null` when there are no maintenance records at all. NOT 0. */
  maintenanceCompletionRate: number | null;
}

export interface CostBreakdown {
  byCategory: Record<string, number>;
  byVehicle: Array<{ license_plate: string; total: number }>;
  /**
   * `null` when there is no previous period to compare against.
   *
   * Was `0`, which renders as "flat vs last period" -- a claim about a
   * comparison that could not be made. A tenant in its first month saw
   * "0% change" and read it as stability.
   */
  percentageChange: number | null;
}

export interface FuelEfficiencyTrend {
  month: string;
  /**
   * km per unit of fuel, or `null` when it cannot be computed.
   *
   * Was `0` for any month with fuel logged but no trips recorded, which
   * plots as a catastrophic efficiency COLLAPSE rather than as a gap in
   * the data. Same defect as fleet-health's fuelEfficiencyAverage, which
   * was made nullable last round; this one was missed.
   */
  efficiency: number | null;
}

export interface MaintenanceForecast {
  license_plate: string;
  daysUntilDue: number;
  /**
   * `null` when the reminder records no estimate.
   *
   * Was a hard-coded 500 for every reminder without one -- a fabricated
   * number summed into a forecast a manager budgets against. Note the
   * contrast already present in this codebase: ScheduleMaintenanceAction
   * deliberately OMITS estimated_cost rather than zero-filling it,
   * because "a 0 here reads as 'free', and it is an input to the
   * maintenance forecast". A 500 is the same error in the other
   * direction.
   */
  estimatedCost: number | null;
}

export class FleetAnalyticsService {
  /**
   * LEAK FIX (dashboard). Every method on this service delegates to
   * repository *Stats methods that ALREADY accept an optional
   * TenantContext -- four of the five have accepted one since Phase B.
   * The service simply never passed it, so the whole dashboard aggregate
   * surface (KPIs, cost breakdown, fuel-efficiency trend, maintenance
   * forecast) ran organization-wide for every scoped user while the list
   * endpoints beneath were correctly filtered.
   *
   * `context` is threaded through as an optional trailing parameter so
   * org-wide callers are unaffected.
   */
  /**
   * WAVE 3, R.3.1. `hasFinancialAccess` is mandatory (no default) so a
   * forgotten argument at a new call site is a TypeScript error rather
   * than a silent fail-open that leaks financial figures to a caller
   * whose only permission is ANALYTICS_VIEW. Callers derive it from
   * hasAnyPermission(authContext, [EXPENSE_VIEW, FUEL_VIEW, FINANCE_VIEW])
   * -- see analytics.controller.ts.
   */
  async getFleetKPIs(
    tenantId: string,
    dateRange: DateRange | undefined,
    context: TenantContext | undefined,
    hasFinancialAccess: boolean
  ): Promise<FleetKPIs> {
    const [vehicleStats, expenseStats, fuelStats, maintenanceStats, tripStats] =
      await Promise.all([
        vehicleRepository.getVehicleStats(tenantId, context),
        expenseRepository.getExpenseStats(tenantId, dateRange, undefined, context),
        fuelRepository.getFuelStats(tenantId, dateRange, undefined, context),
        maintenanceRepository.getMaintenanceStats(tenantId, undefined, context),
        tripRepository.getTripStats(tenantId, dateRange, context),
      ]);

    const totalFuelVolume = fuelStats.totalFuel;
    const totalDistance = tripStats.totalDistance;

    const averageFuelEfficiency =
      totalFuelVolume > 0 && totalDistance > 0
        ? totalDistance / totalFuelVolume
        : null;

    const totalOperatingCost = expenseStats.total + fuelStats.totalCost;
    const costPerKm =
      totalDistance > 0 ? totalOperatingCost / totalDistance : null;

    return {
      totalVehicles: vehicleStats.total,
      activeVehicles: vehicleStats.active,
      maintenanceVehicles: vehicleStats.maintenance,
      totalExpenses: hasFinancialAccess ? expenseStats.total : null,
      totalFuelCost: hasFinancialAccess ? fuelStats.totalCost : null,
      totalFuelVolume,
      totalDistance,
      averageFuelEfficiency,
      costPerKm: hasFinancialAccess ? costPerKm : null,
      pendingMaintenance: maintenanceStats.pending,
      overdueMaintenance: maintenanceStats.overdue,
      financialAccessRestricted: !hasFinancialAccess,
    };
  }

  async getOperationalMetrics(
    tenantId: string,
    dateRange: DateRange,
    context?: TenantContext
  ): Promise<OperationalMetrics> {
    const daysDiff = Math.max(
      1,
      Math.ceil(
        (dateRange.endDate.getTime() - dateRange.startDate.getTime()) /
          (1000 * 60 * 60 * 24)
      )
    );

    const [expenseStats, tripStats, maintenanceStats, vehicleStats] =
      await Promise.all([
        expenseRepository.getExpenseStats(tenantId, dateRange, undefined, context),
        tripRepository.getTripStats(tenantId, dateRange, context),
        maintenanceRepository.getMaintenanceStats(tenantId, undefined, context),
        vehicleRepository.getVehicleStats(tenantId, context),
      ]);

    return {
      averageDailyDistance: tripStats.totalDistance / daysDiff,
      averageDailyExpense: expenseStats.total / daysDiff,
      /*
        HONEST METRICS. Both of these divided by a vehicle count and
        fell back to 0. "Average cost per vehicle: $0" and "Utilization
        rate: 0%" are measurements; the honest answer for a fleet of
        zero vehicles is that neither quantity is defined. Same
        reasoning as costPerKm above, which was fixed in the earlier
        round and is the model these now follow.
      */
      averageCostPerVehicle:
        vehicleStats.total > 0 ? expenseStats.total / vehicleStats.total : null,
      vehicleUtilizationRate:
        vehicleStats.total > 0 ? tripStats.totalTrips / vehicleStats.total : null,
      maintenanceCompletionRate: maintenanceStats.completionRate,
    };
  }

  async getCostBreakdown(
    tenantId: string,
    dateRange: DateRange,
    context?: TenantContext
  ): Promise<CostBreakdown> {
    const durationMs =
      dateRange.endDate.getTime() - dateRange.startDate.getTime();
    const previousRange: DateRange = {
      startDate: new Date(dateRange.startDate.getTime() - durationMs),
      endDate: dateRange.startDate,
    };

    const [expenseStats, previousPeriodStats] = await Promise.all([
      expenseRepository.getExpenseStats(tenantId, dateRange, undefined, context),
      expenseRepository.getExpenseStats(tenantId, previousRange, undefined, context),
    ]);

    const byVehicle = await vehicleRepository.getVehicleAnalytics(
      tenantId,
      dateRange.startDate,
      dateRange.endDate,
      context
    );

    const byVehicleMapped = (byVehicle as any[])
      .map((v) => ({
        license_plate: v.license_plate,
        total: v.totalOperatingCost || 0,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    // null, not 0 -- see CostBreakdown.percentageChange.
    const percentageChange =
      previousPeriodStats.total > 0
        ? ((expenseStats.total - previousPeriodStats.total) /
            previousPeriodStats.total) *
          100
        : null;

    return {
      byCategory: expenseStats.byType,
      byVehicle: byVehicleMapped,
      percentageChange,
    };
  }

  async getFuelEfficiencyTrend(
    tenantId: string,
    context: TenantContext | undefined,
    months: number = 6
  ): Promise<FuelEfficiencyTrend[]> {
    const [monthlyFuel, dailyTrips] = await Promise.all([
      fuelRepository.getMonthlyFuelConsumption(tenantId, months, undefined, context),
      tripRepository.getDailyDistance(tenantId, months * 30, context),
    ]);

    const tripsByMonth: Record<string, number> = {};
    dailyTrips.forEach((trip) => {
      const month = trip.date.substring(0, 7);
      tripsByMonth[month] = (tripsByMonth[month] || 0) + trip.distance;
    });

    return monthlyFuel.map((m) => {
      const distance = tripsByMonth[m.month];
      /**
       * Two different unknowns, both previously reported as 0:
       *   - no fuel logged in the month  -> nothing to divide by
       *   - fuel logged but NO TRIPS     -> 0 / fuel = 0 km/L, which
       *     plots as the fleet's efficiency collapsing to nothing
       *
       * A month with no trip distance is a gap in the record, not a
       * measurement of zero efficiency.
       */
      const measurable = m.fuel > 0 && typeof distance === 'number' && distance > 0;
      return {
        month: m.month,
        efficiency: measurable ? distance / m.fuel : null,
      };
    });
  }

  async getMaintenanceForecast(
    tenantId: string,
    context?: TenantContext
  ): Promise<MaintenanceForecast[]> {
    const upcomingReminders =
      await maintenanceRepository.getUpcomingReminders(tenantId, 30, context);

    return upcomingReminders.map((reminder) => {
      const daysUntilDue = Math.ceil(
        (new Date(reminder.due_date).getTime() - new Date().getTime()) /
          (1000 * 60 * 60 * 24)
      );

      let priority: 'high' | 'medium' | 'low' = 'low';
      if (daysUntilDue <= 7) priority = 'high';
      else if (daysUntilDue <= 14) priority = 'medium';

      return {
        license_plate: reminder.license_plate,
        daysUntilDue,
        /**
         * The reminder's OWN estimate, or null.
         *
         * `reminder.estimated_cost || 500` fabricated a cost for every
         * reminder that had none -- and, because it used `||` rather
         * than `??`, silently overwrote a genuine estimate of 0 with
         * 500 as well.
         */
        estimatedCost:
          typeof reminder.estimated_cost === 'number' ? reminder.estimated_cost : null,
        priority,
      };
    });
  }
}

export const fleetAnalyticsService = new FleetAnalyticsService();