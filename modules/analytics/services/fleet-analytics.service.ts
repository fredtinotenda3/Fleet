// modules/analytics/services/fleet-analytics.service.ts

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
  totalExpenses: number;
  totalFuelCost: number;
  totalFuelVolume: number;
  totalDistance: number;
  averageFuelEfficiency: number | null;
  costPerKm: number | null;
  pendingMaintenance: number;
  overdueMaintenance: number;
}

export interface OperationalMetrics {
  averageDailyDistance: number;
  averageDailyExpense: number;
  averageCostPerVehicle: number;
  vehicleUtilizationRate: number;
  maintenanceCompletionRate: number;
}

export interface CostBreakdown {
  byCategory: Record<string, number>;
  byVehicle: Array<{ license_plate: string; total: number }>;
  percentageChange: number;
}

export interface FuelEfficiencyTrend {
  month: string;
  efficiency: number;
}

export interface MaintenanceForecast {
  license_plate: string;
  daysUntilDue: number;
  estimatedCost: number;
  priority: 'high' | 'medium' | 'low';
}

export class FleetAnalyticsService {
  async getFleetKPIs(
    tenantId: string,
    dateRange?: DateRange
  ): Promise<FleetKPIs> {
    const [vehicleStats, expenseStats, fuelStats, maintenanceStats, tripStats] =
      await Promise.all([
        vehicleRepository.getVehicleStats(tenantId),
        expenseRepository.getExpenseStats(tenantId, dateRange),
        fuelRepository.getFuelStats(tenantId, dateRange),
        maintenanceRepository.getMaintenanceStats(tenantId),
        tripRepository.getTripStats(tenantId, dateRange),
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
      totalExpenses: expenseStats.total,
      totalFuelCost: fuelStats.totalCost,
      totalFuelVolume,
      totalDistance,
      averageFuelEfficiency,
      costPerKm,
      pendingMaintenance: maintenanceStats.pending,
      overdueMaintenance: maintenanceStats.overdue,
    };
  }

  async getOperationalMetrics(
    tenantId: string,
    dateRange: DateRange
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
        expenseRepository.getExpenseStats(tenantId, dateRange),
        tripRepository.getTripStats(tenantId, dateRange),
        maintenanceRepository.getMaintenanceStats(tenantId),
        vehicleRepository.getVehicleStats(tenantId),
      ]);

    return {
      averageDailyDistance: tripStats.totalDistance / daysDiff,
      averageDailyExpense: expenseStats.total / daysDiff,
      averageCostPerVehicle:
        vehicleStats.total > 0
          ? expenseStats.total / vehicleStats.total
          : 0,
      vehicleUtilizationRate:
        vehicleStats.total > 0
          ? tripStats.totalTrips / vehicleStats.total
          : 0,
      maintenanceCompletionRate: maintenanceStats.completionRate,
    };
  }

  async getCostBreakdown(
    tenantId: string,
    dateRange: DateRange
  ): Promise<CostBreakdown> {
    const durationMs =
      dateRange.endDate.getTime() - dateRange.startDate.getTime();
    const previousRange: DateRange = {
      startDate: new Date(dateRange.startDate.getTime() - durationMs),
      endDate: dateRange.startDate,
    };

    const [expenseStats, previousPeriodStats] = await Promise.all([
      expenseRepository.getExpenseStats(tenantId, dateRange),
      expenseRepository.getExpenseStats(tenantId, previousRange),
    ]);

    const byVehicle = await vehicleRepository.getVehicleAnalytics(
      tenantId,
      dateRange.startDate,
      dateRange.endDate
    );

    const byVehicleMapped = (byVehicle as any[])
      .map((v) => ({
        license_plate: v.license_plate,
        total: v.totalOperatingCost || 0,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    const percentageChange =
      previousPeriodStats.total > 0
        ? ((expenseStats.total - previousPeriodStats.total) /
            previousPeriodStats.total) *
          100
        : 0;

    return {
      byCategory: expenseStats.byType,
      byVehicle: byVehicleMapped,
      percentageChange,
    };
  }

  async getFuelEfficiencyTrend(
    tenantId: string,
    months: number = 6
  ): Promise<FuelEfficiencyTrend[]> {
    const [monthlyFuel, dailyTrips] = await Promise.all([
      fuelRepository.getMonthlyFuelConsumption(tenantId, months),
      tripRepository.getDailyDistance(tenantId, months * 30),
    ]);

    const tripsByMonth: Record<string, number> = {};
    dailyTrips.forEach((trip) => {
      const month = trip.date.substring(0, 7);
      tripsByMonth[month] = (tripsByMonth[month] || 0) + trip.distance;
    });

    return monthlyFuel.map((m) => ({
      month: m.month,
      efficiency:
        m.fuel > 0 ? (tripsByMonth[m.month] || 0) / m.fuel : 0,
    }));
  }

  async getMaintenanceForecast(
    tenantId: string
  ): Promise<MaintenanceForecast[]> {
    const upcomingReminders =
      await maintenanceRepository.getUpcomingReminders(tenantId, 30);
    const averageCost = 500;

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
        estimatedCost: reminder.estimated_cost || averageCost,
        priority,
      };
    });
  }
}

export const fleetAnalyticsService = new FleetAnalyticsService();