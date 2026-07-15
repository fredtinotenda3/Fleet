// modules/ai/services/fleet-health.service.ts

import { BaseAIService } from './base-ai.service';
import {
  FleetHealthScore,
  FleetHealthRecommendation,
  AIResult,
  VehicleEntity,
  MaintenanceEntity,
  ExpenseEntity,
  TripEntity,
  FuelEntity,
} from '../types/ai.types';
import { vehicleRepository } from '@/modules/vehicles/repositories/vehicle.repository';
import { maintenanceRepository } from '@/modules/maintenance/repositories/maintenance.repository';
import { expenseRepository } from '@/modules/expenses/repositories/expense.repository';
import { tripRepository } from '@/modules/trips/repositories/trip.repository';
import { fuelRepository } from '@/modules/fuel/repositories/fuel.repository';

export class FleetHealthService extends BaseAIService {
  protected readonly serviceName = 'FleetHealth';
  protected readonly predictionType = 'health_score';

  async calculateHealthScore(tenantId: string): Promise<AIResult<FleetHealthScore>> {
    try {
      const [vehicles, maintenance, expenses, trips, fuel] = await Promise.all([
        vehicleRepository.findMany({ isDeleted: { $ne: true } }, tenantId) as Promise<VehicleEntity[]>,
        maintenanceRepository.findMany({}, tenantId) as Promise<MaintenanceEntity[]>,
        expenseRepository.findMany({}, tenantId) as Promise<ExpenseEntity[]>,
        tripRepository.findMany({}, tenantId) as Promise<TripEntity[]>,
        fuelRepository.findMany({}, tenantId) as Promise<FuelEntity[]>,
      ]);

      // Calculate vehicle scores
      const vehicleScores = this.calculateVehicleScores(
        vehicles,
        maintenance,
        expenses,
        trips,
        fuel
      );

      // Calculate fleet metrics
      const metrics = this.calculateFleetMetrics(vehicles, maintenance, trips, fuel);

      // Calculate overall score
      const overallScore = Math.round(
        vehicleScores.reduce((sum, v) => sum + v.score, 0) / Math.max(1, vehicleScores.length)
      );

      // Generate trends
      const trends = this.generateTrends(vehicleScores, maintenance);

      // Generate recommendations
      const recommendations = this.generateRecommendations(
        vehicles,
        maintenance,
        vehicleScores,
        metrics
      );

      const healthScore: FleetHealthScore = {
        overallScore,
        timestamp: new Date(),
        vehicleScores,
        metrics,
        trends,
        recommendations,
      };

      this.logPrediction({
        overallScore,
        vehicleCount: vehicleScores.length,
        recommendationsCount: recommendations.length,
      });

      return {
        success: true,
        data: healthScore,
        timestamp: new Date(),
      };
    } catch (error) {
      this.logError('Failed to calculate fleet health score', error as Error, { tenantId });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date(),
      };
    }
  }

  private calculateVehicleScores(
    vehicles: VehicleEntity[],
    maintenance: MaintenanceEntity[],
    expenses: ExpenseEntity[],
    trips: TripEntity[],
    fuel: FuelEntity[]
  ): FleetHealthScore['vehicleScores'] {
    const scores: FleetHealthScore['vehicleScores'] = [];

    for (const vehicle of vehicles) {
      const vehicleMaintenance = maintenance.filter(
        (m) => m.license_plate === vehicle.license_plate
      );
      const vehicleExpenses = expenses.filter(
        (e) => e.license_plate === vehicle.license_plate
      );
      const vehicleTrips = trips.filter(
        (t) => t.license_plate === vehicle.license_plate
      );
      const vehicleFuel = fuel.filter(
        (f) => f.license_plate === vehicle.license_plate
      );

      const components = {
        engine: this.calculateComponentScore(vehicleMaintenance, 'engine'),
        transmission: this.calculateComponentScore(vehicleMaintenance, 'transmission'),
        brakes: this.calculateComponentScore(vehicleMaintenance, 'brakes'),
        tires: this.calculateComponentScore(vehicleMaintenance, 'tires'),
        battery: this.calculateComponentScore(vehicleMaintenance, 'battery'),
        suspension: this.calculateComponentScore(vehicleMaintenance, 'suspension'),
      };

      const maintenanceScore = this.calculateMaintenanceScore(vehicleMaintenance);
      const expenseScore = this.calculateExpenseScore(vehicleExpenses);
      const tripScore = this.calculateTripScore(vehicleTrips);
      const fuelScore = this.calculateFuelScore(vehicleFuel);

      const overall = Math.round(
        (components.engine * 0.25 +
         components.transmission * 0.20 +
         components.brakes * 0.15 +
         components.tires * 0.10 +
         components.battery * 0.08 +
         components.suspension * 0.07 +
         maintenanceScore * 0.05 +
         expenseScore * 0.05 +
         tripScore * 0.03 +
         fuelScore * 0.02)
      );

      scores.push({
        vehicleId: vehicle._id,
        licensePlate: vehicle.license_plate,
        score: overall,
        components,
      });
    }

    return scores;
  }

  private calculateComponentScore(
    maintenance: MaintenanceEntity[],
    componentType: string
  ): number {
    const componentMaintenance = maintenance.filter(
      (m) => m.category?.toLowerCase().includes(componentType) ||
             m.title?.toLowerCase().includes(componentType)
    );

    const completed = componentMaintenance.filter((m) => m.status === 'completed');
    const overdue = componentMaintenance.filter(
      (m) => m.status === 'overdue' || (m.due_date && m.due_date < new Date())
    );

    const baseScore = 70;
    const completionRate = completed.length / Math.max(1, componentMaintenance.length);
    const overduePenalty = overdue.length * 10;

    return Math.max(0, Math.min(100, baseScore + completionRate * 30 - overduePenalty));
  }

  private calculateMaintenanceScore(maintenance: MaintenanceEntity[]): number {
    const completed = maintenance.filter((m) => m.status === 'completed');
    const total = maintenance.length;
    const completionRate = total > 0 ? completed.length / total : 0.8;
    return Math.round(50 + completionRate * 50);
  }

  private calculateExpenseScore(expenses: ExpenseEntity[]): number {
    const average = expenses.reduce((sum, e) => sum + e.amount, 0) / Math.max(1, expenses.length);
    const expected = 200; // Benchmark
    const ratio = Math.min(1, expected / Math.max(1, average));
    return Math.round(50 + ratio * 50);
  }

  private calculateTripScore(trips: TripEntity[]): number {
    const avgDistance = trips.reduce((sum, t) => sum + t.distance_calculated, 0) / Math.max(1, trips.length);
    const expected = 100; // Benchmark
    const ratio = Math.min(1, avgDistance / Math.max(1, expected));
    return Math.round(50 + ratio * 50);
  }

  private calculateFuelScore(fuel: FuelEntity[]): number {
    const avgEfficiency = fuel.reduce((sum, f) => {
      return sum + (f.fuel_volume / Math.max(1, f.odometer || 1));
    }, 0) / Math.max(1, fuel.length);
    const expected = 10; // km/L
    const ratio = Math.min(1, avgEfficiency / expected);
    return Math.round(50 + ratio * 50);
  }

  private calculateFleetMetrics(
    vehicles: VehicleEntity[],
    maintenance: MaintenanceEntity[],
    trips: TripEntity[],
    fuel: FuelEntity[]
  ): FleetHealthScore['metrics'] {
    const totalMileage = trips.reduce((sum, t) => sum + t.distance_calculated, 0);
    const totalFuel = fuel.reduce((sum, f) => sum + f.fuel_volume, 0);

    const completedMaintenance = maintenance.filter((m) => m.status === 'completed');
    const pendingMaintenance = maintenance.filter((m) => m.status === 'pending');
    const overdueMaintenance = maintenance.filter(
      (m) => m.status === 'overdue' || (m.due_date && m.due_date < new Date())
    );

    return {
      averageVehicleAge: vehicles.reduce((sum, v) => sum + (new Date().getFullYear() - (v.year || 2020)), 0) / Math.max(1, vehicles.length),
      averageMileage: totalMileage / Math.max(1, vehicles.length),
      maintenanceCompletionRate: maintenance.length > 0 ? completedMaintenance.length / maintenance.length : 1,
      pendingMaintenanceCount: pendingMaintenance.length,
      overdueMaintenanceCount: overdueMaintenance.length,
      averageDowntime: 5, // Placeholder - needs real data
      fuelEfficiencyAverage: totalFuel > 0 ? totalMileage / totalFuel : 0,
    };
  }

  /**
   * FIX (high -- fabricated data): this used to generate weekly/monthly/
   * yearly trend arrays as Math.random() noise scattered around the
   * *current* average score -- i.e. a fake history that had no relation
   * to what actually happened on the fleet in prior periods.
   *
   * There's no historical health-score snapshot store in this codebase
   * to read real past scores from, so each point here is instead
   * computed from real maintenance records that fall within that
   * window (by `created_at`), using the same completion-rate /
   * overdue-penalty methodology as calculateMaintenanceScore /
   * calculateComponentScore elsewhere in this file. A window with no
   * maintenance activity falls back to the current fleet score (flat
   * baseline) rather than inventing movement.
   */
  private generateTrends(
    vehicleScores: FleetHealthScore['vehicleScores'],
    maintenance: MaintenanceEntity[]
  ): FleetHealthScore['trends'] {
    const currentAvgScore =
      vehicleScores.reduce((sum, v) => sum + v.score, 0) / Math.max(1, vehicleScores.length);

    const scoreForWindow = (start: Date, end: Date): number => {
      const windowMaintenance = maintenance.filter((m) => {
        const ref = m.created_at ? new Date(m.created_at) : null;
        return ref ? ref >= start && ref <= end : false;
      });

      if (windowMaintenance.length === 0) {
        return Math.round(currentAvgScore);
      }

      const completed = windowMaintenance.filter((m) => m.status === 'completed').length;
      const overdue = windowMaintenance.filter(
        (m) => m.status === 'overdue' || (m.due_date && new Date(m.due_date) < end)
      ).length;

      const completionRate = completed / windowMaintenance.length;
      const overduePenalty = Math.min(40, overdue * 8);

      return Math.max(0, Math.min(100, Math.round(50 + completionRate * 50 - overduePenalty)));
    };

    const now = new Date();

    const weekly: number[] = [];
    for (let i = 3; i >= 0; i--) {
      const end = new Date(now);
      end.setDate(end.getDate() - i * 7);
      const start = new Date(end);
      start.setDate(start.getDate() - 7);
      weekly.push(scoreForWindow(start, end));
    }

    const monthly: number[] = [];
    for (let i = 2; i >= 0; i--) {
      const end = new Date(now);
      end.setMonth(end.getMonth() - i);
      const start = new Date(end);
      start.setMonth(start.getMonth() - 1);
      monthly.push(scoreForWindow(start, end));
    }

    const yearly: number[] = [];
    for (let i = 1; i >= 0; i--) {
      const end = new Date(now);
      end.setFullYear(end.getFullYear() - i);
      const start = new Date(end);
      start.setFullYear(start.getFullYear() - 1);
      yearly.push(scoreForWindow(start, end));
    }

    return { weekly, monthly, yearly };
  }

  private generateRecommendations(
    vehicles: VehicleEntity[],
    maintenance: MaintenanceEntity[],
    vehicleScores: FleetHealthScore['vehicleScores'],
    metrics: FleetHealthScore['metrics']
  ): FleetHealthRecommendation[] {
    const recommendations: FleetHealthRecommendation[] = [];

    // Low scoring vehicles
    const lowScoring = vehicleScores.filter((v) => v.score < 50);
    if (lowScoring.length > 0) {
      recommendations.push({
        priority: 'high',
        category: 'Maintenance',
        title: `Service ${lowScoring.length} low-health vehicles`,
        description: `Vehicles with health scores below 50% require immediate attention.`,
        affectedVehicles: lowScoring.map((v) => v.licensePlate),
        estimatedCost: lowScoring.length * 500,
        estimatedBenefit: lowScoring.length * 2000,
        roi: 4,
      });
    }

    // Overdue maintenance
    if (metrics.overdueMaintenanceCount > 0) {
      recommendations.push({
        priority: 'critical',
        category: 'Maintenance',
        title: `${metrics.overdueMaintenanceCount} overdue maintenance tasks`,
        description: `Address overdue maintenance to prevent breakdowns and reduce costs.`,
        affectedVehicles: [],
        estimatedCost: metrics.overdueMaintenanceCount * 300,
        estimatedBenefit: metrics.overdueMaintenanceCount * 1200,
        roi: 4,
      });
    }

    // Low fuel efficiency
    if (metrics.fuelEfficiencyAverage < 8) {
      recommendations.push({
        priority: 'medium',
        category: 'Fuel',
        title: 'Improve fleet fuel efficiency',
        description: `Current fuel efficiency (${metrics.fuelEfficiencyAverage.toFixed(1)} km/L) is below optimal.`,
        affectedVehicles: [],
        estimatedCost: 1000,
        estimatedBenefit: 5000,
        roi: 5,
      });
    }

    // High average age
    if (metrics.averageVehicleAge > 10) {
      recommendations.push({
        priority: 'medium',
        category: 'Fleet',
        title: 'Consider fleet replacement cycle',
        description: `Average fleet age (${metrics.averageVehicleAge.toFixed(1)} years) suggests replacement planning.`,
        affectedVehicles: [],
        estimatedCost: vehicles.length * 30000,
        estimatedBenefit: vehicles.length * 50000,
        roi: 1.67,
      });
    }

    return recommendations;
  }
}

export const fleetHealthService = new FleetHealthService();