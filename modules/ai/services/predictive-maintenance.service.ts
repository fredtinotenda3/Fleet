/* eslint-disable @typescript-eslint/no-unused-vars */
// modules/ai/services/predictive-maintenance.service.ts

import { BaseAIService } from './base-ai.service';
import {
  PredictiveMaintenancePrediction,
  AIResult,
  AIBatchResult,
  AISeverity,
} from '../types/ai.types';
import { vehicleRepository } from '@/modules/vehicles/repositories/vehicle.repository';
import { maintenanceRepository } from '@/modules/maintenance/repositories/maintenance.repository';
import { tripRepository } from '@/modules/trips/repositories/trip.repository';
import { fuelRepository } from '@/modules/fuel/repositories/fuel.repository';
import { telematicsRepository } from '@/modules/telematics/repositories/telematics.repository';
import { monitoring } from '@/infrastructure/monitoring/logger';
import { randomUUID } from 'crypto';

interface ComponentHealth {
  component: string;
  componentType: PredictiveMaintenancePrediction['componentType'];
  healthScore: number; // 0-100
  estimatedLifeRemaining: number; // days
  failureProbability: number; // 0-1
  symptoms: string[];
  historicalFailureRate: number;
}

const COMPONENT_WEIGHTS = {
  engine: 0.35,
  transmission: 0.25,
  brakes: 0.15,
  tires: 0.10,
  battery: 0.08,
  suspension: 0.04,
  electrical: 0.03,
  other: 0.0,
};

const COMPONENT_LIFESPAN_KM: Record<string, number> = {
  engine: 300_000,
  transmission: 250_000,
  brakes: 60_000,
  tires: 50_000,
  battery: 60_000,
  suspension: 80_000,
  electrical: 100_000,
};

export class PredictiveMaintenanceService extends BaseAIService {
  protected readonly serviceName = 'PredictiveMaintenance';
  protected readonly predictionType = 'maintenance';

  async predictAll(tenantId: string): Promise<AIBatchResult<PredictiveMaintenancePrediction>> {
    try {
      const vehicles = await vehicleRepository.findMany({ isDeleted: { $ne: true } }, tenantId);
      const results: AIBatchResult<PredictiveMaintenancePrediction> = {
        success: true,
        results: [],
        total: vehicles.length,
        succeeded: 0,
        failed: 0,
        timestamp: new Date(),
      };

      for (const vehicle of vehicles) {
        try {
          const prediction = await this.predictVehicle(vehicle._id!, tenantId);
          if (prediction.success && prediction.data) {
            results.results.push({
              entityId: vehicle._id!,
              success: true,
              data: prediction.data,
            });
            results.succeeded++;
          } else {
            results.results.push({
              entityId: vehicle._id!,
              success: false,
              error: prediction.error || 'Unknown error',
            });
            results.failed++;
          }
        } catch (error) {
          results.results.push({
            entityId: vehicle._id!,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
          results.failed++;
        }
      }

      return results;
    } catch (error) {
      this.logError('Batch prediction failed', error as Error, { tenantId });
      return {
        success: false,
        results: [],
        total: 0,
        succeeded: 0,
        failed: 0,
        timestamp: new Date(),
      };
    }
  }

  async predictVehicle(
    vehicleId: string,
    tenantId: string
  ): Promise<AIResult<PredictiveMaintenancePrediction>> {
    try {
      const vehicle = await vehicleRepository.findById(vehicleId, tenantId);
      if (!vehicle) {
        return {
          success: false,
          error: 'Vehicle not found',
          timestamp: new Date(),
        };
      }

      // Gather data
      const [maintenance, trips, fuel, telematics] = await Promise.all([
        maintenanceRepository.findMany(
          { license_plate: vehicle.license_plate, status: { $ne: 'pending' } },
          tenantId
        ),
        tripRepository.findMany({ license_plate: vehicle.license_plate }, tenantId),
        fuelRepository.findMany({ license_plate: vehicle.license_plate }, tenantId),
        telematicsRepository.getLatestTelematicsData(vehicleId, tenantId),
      ]);

      // Calculate component health
      const componentHealth = this.calculateComponentHealth(
        vehicle,
        maintenance,
        trips,
        fuel,
        telematics
      );

      // Find the most critical component
      const criticalComponent = this.findCriticalComponent(componentHealth);

      if (!criticalComponent) {
        return {
          success: false,
          error: 'No critical components found',
          timestamp: new Date(),
        };
      }

      // Build prediction with predictionId
      const predictionId = randomUUID();
      const prediction = this.buildPrediction(vehicle, criticalComponent, componentHealth, predictionId);

      this.logPrediction({
        vehicleId,
        licensePlate: vehicle.license_plate,
        component: prediction.component,
        confidence: prediction.confidence,
      });

      return {
        success: true,
        data: prediction,
        predictionId: predictionId, // Use the generated predictionId
        confidence: prediction.confidence,
        timestamp: new Date(),
      };
    } catch (error) {
      this.logError(`Failed to predict for vehicle ${vehicleId}`, error as Error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date(),
      };
    }
  }

  private calculateComponentHealth(
    vehicle: any,
    maintenance: any[],
    trips: any[],
    fuel: any[],
    telematics: any
  ): ComponentHealth[] {
    const totalDistance = trips.reduce((sum, t) => sum + (t.distance_calculated || 0), 0);
    const totalFuel = fuel.reduce((sum, f) => sum + (f.fuel_volume || 0), 0);
    const avgFuelEfficiency = totalFuel > 0 ? totalDistance / totalFuel : 0;

    const components: ComponentHealth[] = [];

    // Engine health
    const engineHealth = this.assessEngineHealth(
      vehicle,
      maintenance,
      telematics,
      totalDistance,
      avgFuelEfficiency
    );
    components.push(engineHealth);

    // Transmission health
    const transmissionHealth = this.assessTransmissionHealth(
      vehicle,
      maintenance,
      totalDistance
    );
    components.push(transmissionHealth);

    // Brakes health
    const brakesHealth = this.assessBrakesHealth(
      vehicle,
      maintenance,
      totalDistance,
      telematics
    );
    components.push(brakesHealth);

    // Tires health
    const tiresHealth = this.assessTiresHealth(
      vehicle,
      maintenance,
      totalDistance
    );
    components.push(tiresHealth);

    // Battery health
    const batteryHealth = this.assessBatteryHealth(
      vehicle,
      maintenance,
      telematics
    );
    components.push(batteryHealth);

    return components.filter(c => c !== null);
  }

  private assessEngineHealth(
    vehicle: any,
    maintenance: any[],
    telematics: any,
    totalDistance: number,
    avgFuelEfficiency: number
  ): ComponentHealth {
    const engineMaintenance = maintenance.filter(
      (m) => m.title?.toLowerCase().includes('engine') ||
             m.category === 'engine_gearbox'
    );

    const recentEngineIssues = engineMaintenance.filter(
      (m) => m.status === 'completed' &&
             m.completion_date &&
             new Date(m.completion_date) > new Date(Date.now() - 180 * 24 * 60 * 60 * 1000)
    );

    // Calculate health factors
    const ageFactor = Math.max(0, 1 - (vehicle.year ? (new Date().getFullYear() - vehicle.year) / 20 : 0));
    const mileageFactor = Math.max(0, 1 - (totalDistance / 500_000));
    const maintenanceFactor = Math.min(1, engineMaintenance.length / 10);
    const issueFactor = Math.max(0, 1 - (recentEngineIssues.length / 5));

    // Telematics factors
    const engineTemp = telematics?.engine?.coolantTemp || 90;
    const tempFactor = engineTemp < 105 ? 1 : Math.max(0, 1 - (engineTemp - 105) / 20);
    const rpmFactor = telematics?.engine?.rpm ? Math.min(1, 3000 / (telematics.engine.rpm || 3000)) : 0.8;

    // Fuel efficiency factor
    const efficiencyFactor = avgFuelEfficiency > 0
      ? Math.min(1, avgFuelEfficiency / 10)
      : 0.5;

    const healthScore = Math.round(
      (ageFactor * 0.15 +
       mileageFactor * 0.20 +
       maintenanceFactor * 0.15 +
       issueFactor * 0.15 +
       tempFactor * 0.15 +
       rpmFactor * 0.10 +
       efficiencyFactor * 0.10) * 100
    );

    const failureProbability = 1 - (healthScore / 100);

    return {
      component: 'Engine',
      componentType: 'engine',
      healthScore,
      estimatedLifeRemaining: this.estimateComponentLife('engine', healthScore, totalDistance),
      failureProbability,
      symptoms: this.detectEngineSymptoms(telematics, avgFuelEfficiency),
      historicalFailureRate: engineMaintenance.length / Math.max(1, (vehicle.year ? new Date().getFullYear() - vehicle.year : 1)),
    };
  }

  private assessTransmissionHealth(
    vehicle: any,
    maintenance: any[],
    totalDistance: number
  ): ComponentHealth {
    const transmissionMaintenance = maintenance.filter(
      (m) => m.title?.toLowerCase().includes('transmission') ||
             m.title?.toLowerCase().includes('gearbox')
    );

    const healthScore = Math.round(
      (Math.max(0, 1 - (totalDistance / 350_000)) * 0.4 +
       Math.min(1, 1 - (transmissionMaintenance.length / 3)) * 0.3 +
       Math.random() * 0.3) * 100
    );

    return {
      component: 'Transmission',
      componentType: 'transmission',
      healthScore,
      estimatedLifeRemaining: this.estimateComponentLife('transmission', healthScore, totalDistance),
      failureProbability: 1 - (healthScore / 100),
      symptoms: [],
      historicalFailureRate: transmissionMaintenance.length / Math.max(1, (vehicle.year ? new Date().getFullYear() - vehicle.year : 1)),
    };
  }

  private assessBrakesHealth(
    vehicle: any,
    maintenance: any[],
    totalDistance: number,
    telematics: any
  ): ComponentHealth {
    const brakeMaintenance = maintenance.filter(
      (m) => m.title?.toLowerCase().includes('brake')
    );

    const hardBrakes = telematics?.alerts?.filter((a: any) => a.type === 'hard_brake').length || 0;

    const healthScore = Math.round(
      (Math.max(0, 1 - (totalDistance / 80_000)) * 0.3 +
       Math.min(1, 1 - (hardBrakes / 50)) * 0.2 +
       Math.min(1, 1 - (brakeMaintenance.length / 5)) * 0.3 +
       Math.random() * 0.2) * 100
    );

    return {
      component: 'Brakes',
      componentType: 'brakes',
      healthScore,
      estimatedLifeRemaining: this.estimateComponentLife('brakes', healthScore, totalDistance),
      failureProbability: 1 - (healthScore / 100),
      symptoms: hardBrakes > 20 ? ['Frequent hard braking detected'] : [],
      historicalFailureRate: brakeMaintenance.length / Math.max(1, (vehicle.year ? new Date().getFullYear() - vehicle.year : 1)),
    };
  }

  private assessTiresHealth(
    vehicle: any,
    maintenance: any[],
    totalDistance: number
  ): ComponentHealth {
    const tireMaintenance = maintenance.filter(
      (m) => m.title?.toLowerCase().includes('tire') ||
             m.title?.toLowerCase().includes('tyre')
    );

    const healthScore = Math.round(
      (Math.max(0, 1 - (totalDistance / 60_000)) * 0.5 +
       Math.min(1, 1 - (tireMaintenance.length / 4)) * 0.3 +
       Math.random() * 0.2) * 100
    );

    return {
      component: 'Tires',
      componentType: 'tires',
      healthScore,
      estimatedLifeRemaining: this.estimateComponentLife('tires', healthScore, totalDistance),
      failureProbability: 1 - (healthScore / 100),
      symptoms: [],
      historicalFailureRate: tireMaintenance.length / Math.max(1, (vehicle.year ? new Date().getFullYear() - vehicle.year : 1)),
    };
  }

  private assessBatteryHealth(
    vehicle: any,
    maintenance: any[],
    telematics: any
  ): ComponentHealth {
    const batteryMaintenance = maintenance.filter(
      (m) => m.title?.toLowerCase().includes('battery')
    );

    const healthScore = Math.round(
      (Math.min(1, 1 - (batteryMaintenance.length / 3)) * 0.4 +
       Math.random() * 0.6) * 100
    );

    return {
      component: 'Battery',
      componentType: 'battery',
      healthScore,
      estimatedLifeRemaining: this.estimateComponentLife('battery', healthScore, 0),
      failureProbability: 1 - (healthScore / 100),
      symptoms: [],
      historicalFailureRate: batteryMaintenance.length / Math.max(1, (vehicle.year ? new Date().getFullYear() - vehicle.year : 1)),
    };
  }

  private estimateComponentLife(
    component: string,
    healthScore: number,
    distance: number
  ): number {
    const lifespan = COMPONENT_LIFESPAN_KM[component] || 100_000;
    const remainingKm = (healthScore / 100) * lifespan;
    const avgDailyKm = distance / Math.max(1, (new Date().getFullYear() - 2020));
    return avgDailyKm > 0 ? Math.round(remainingKm / avgDailyKm) : 365;
  }

  private detectEngineSymptoms(telematics: any, avgFuelEfficiency: number): string[] {
    const symptoms: string[] = [];

    if (telematics?.engine?.coolantTemp > 105) {
      symptoms.push('Engine overheating detected');
    }
    if (telematics?.engine?.rpm > 4000) {
      symptoms.push('High RPM operation detected');
    }
    if (avgFuelEfficiency < 5) {
      symptoms.push('Poor fuel efficiency');
    }
    if (telematics?.engine?.dtcCodes && telematics.engine.dtcCodes.length > 0) {
      symptoms.push(`DTC codes: ${telematics.engine.dtcCodes.join(', ')}`);
    }

    return symptoms;
  }

  private findCriticalComponent(components: ComponentHealth[]): ComponentHealth | null {
    // Sort by health score (lowest first) and failure probability (highest first)
    const sorted = [...components].sort((a, b) => {
      const scoreA = (1 - a.healthScore / 100) * 0.6 + a.failureProbability * 0.4;
      const scoreB = (1 - b.healthScore / 100) * 0.6 + b.failureProbability * 0.4;
      return scoreB - scoreA;
    });

    return sorted.length > 0 ? sorted[0] : null;
  }

  private buildPrediction(
    vehicle: any,
    component: ComponentHealth,
    allComponents: ComponentHealth[],
    predictionId: string
  ): PredictiveMaintenancePrediction {
    const confidence = this.calculateConfidence([
      { weight: 0.4, value: 1 - component.failureProbability },
      { weight: 0.3, value: component.healthScore / 100 },
      { weight: 0.3, value: component.historicalFailureRate > 0 ? 0.7 : 0.9 },
    ]);

    const severity = this.determineSeverity(confidence, 1 - component.healthScore / 100);

    const daysUntilFailure = Math.max(
      1,
      Math.round(component.estimatedLifeRemaining * (1 - component.failureProbability))
    );

    const predictedFailureDate = new Date();
    predictedFailureDate.setDate(predictedFailureDate.getDate() + daysUntilFailure);

    const urgencyMap: Record<number, 'immediate' | 'soon' | 'planned' | 'monitor'> = {
      0: 'monitor',
      1: 'planned',
      2: 'soon',
      3: 'immediate',
    };

    const urgencyLevel = component.healthScore < 30 ? 3 :
                         component.healthScore < 50 ? 2 :
                         component.healthScore < 70 ? 1 : 0;

    const estimatedCost = this.estimateRepairCost(component.componentType);

    const prediction: PredictiveMaintenancePrediction = {
      predictionId, // Add predictionId to the prediction object
      vehicleId: vehicle._id!,
      licensePlate: vehicle.license_plate,
      component: component.component,
      componentType: component.componentType,
      predictedFailureDate,
      confidence,
      severity,
      estimatedCost,
      recommendedAction: this.generateRecommendedAction(component, severity),
      urgency: urgencyMap[urgencyLevel] || 'planned',
      contributingFactors: [
        `Health score: ${component.healthScore}%`,
        `Failure probability: ${Math.round(component.failureProbability * 100)}%`,
        `Historical failure rate: ${Math.round(component.historicalFailureRate * 100)}%`,
      ],
      historicalPatterns: [],
    };

    return prediction;
  }

  private estimateRepairCost(componentType: string): number {
    const costMap: Record<string, number> = {
      engine: 2500,
      transmission: 2000,
      brakes: 500,
      tires: 400,
      battery: 300,
      suspension: 600,
      electrical: 400,
      other: 300,
    };
    return costMap[componentType] || 500;
  }

  private generateRecommendedAction(
    component: ComponentHealth,
    severity: AISeverity
  ): string {
    const urgencyMap: Record<AISeverity, string> = {
      critical: 'Immediate attention required. Schedule emergency maintenance.',
      high: 'Schedule maintenance within 7 days.',
      medium: 'Schedule maintenance within 14 days.',
      low: 'Monitor and plan maintenance within 30 days.',
    };
    return urgencyMap[severity] || 'Monitor component condition.';
  }
}

export const predictiveMaintenanceService = new PredictiveMaintenanceService();