/* eslint-disable @typescript-eslint/no-unused-vars */
// modules/ai/services/fuel-fraud-detection.service.ts

import { BaseAIService } from './base-ai.service';
import {
  FuelFraudAlert,
  FuelAnomaly,
  FuelPattern,
  AIResult,
  AIBatchResult,
  AISeverity,
} from '../types/ai.types';
import { fuelRepository } from '@/modules/fuel/repositories/fuel.repository';
import { vehicleRepository } from '@/modules/vehicles/repositories/vehicle.repository';

interface FuelBaseline {
  averageVolume: number;
  averageCost: number;
  averageFrequency: number;
  efficiency: number;
  standardDeviation: number;
}

export class FuelFraudDetectionService extends BaseAIService {
  protected readonly serviceName = 'FuelFraudDetection';
  protected readonly predictionType = 'fuel_fraud';

  /**
   * FIX (perf, Vercel timeout): this used to call detectVehicleFraud()
   * per vehicle inside a sequential for-loop, and detectVehicleFraud()
   * ran its own vehicleRepository.findById + fuelRepository.findMany
   * query EVERY iteration. For 75 vehicles that's 150 sequential DB
   * round-trips, which is exactly what the "Slow MongoDB query" log
   * spam on /api/ai/dashboard was showing (each tblfuellogs find taking
   * 100ms-2s, one after another). Locally, Next dev has no timeout so it
   * eventually finished in ~40s; on Vercel the function gets killed
   * before that, and the dashboard renders zero/blank stats.
   *
   * Fix: fetch every vehicle's fuel logs in ONE query using
   * { license_plate: { $in: [...] } }, group them into a Map, then run
   * the (pure, in-memory) analysis per vehicle with no further DB calls.
   * This collapses 75 queries into 1.
   */
  async detectFraud(tenantId: string): Promise<AIBatchResult<FuelFraudAlert>> {
    try {
      const vehicles = await vehicleRepository.findMany({ isDeleted: { $ne: true } }, tenantId);

      const results: AIBatchResult<FuelFraudAlert> = {
        success: true,
        results: [],
        total: vehicles.length,
        succeeded: 0,
        failed: 0,
        timestamp: new Date(),
      };

      if (vehicles.length === 0) {
        return results;
      }

      const plates = vehicles.map((v) => v.license_plate).filter(Boolean);

      // Single batched query instead of one findMany() per vehicle.
      const allFuelLogs = await fuelRepository.findMany(
        { license_plate: { $in: plates } },
        tenantId
      );

      const logsByPlate = new Map<string, any[]>();
      for (const log of allFuelLogs) {
        const list = logsByPlate.get(log.license_plate) ?? [];
        list.push(log);
        logsByPlate.set(log.license_plate, list);
      }
      // Preserve the same "most recent 100" cap the single-vehicle path
      // used (fuelRepository.findMany(..., { limit: 100 })), applied
      // in-memory now that everything's already fetched.
      for (const [plate, list] of logsByPlate) {
        logsByPlate.set(plate, list.slice(0, 100));
      }

      for (const vehicle of vehicles) {
        try {
          const fuelLogs = logsByPlate.get(vehicle.license_plate) ?? [];
          const alert = this.buildFraudAlert(vehicle, fuelLogs);

          if (alert.success && alert.data) {
            results.results.push({
              entityId: vehicle._id!,
              success: true,
              data: alert.data,
            });
            results.succeeded++;
          } else {
            results.results.push({
              entityId: vehicle._id!,
              success: false,
              error: alert.error || 'Unknown error',
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
      this.logError('Failed to detect fuel fraud', error as Error, { tenantId });
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

  // Made public: server/events/handlers/ai/AIPredictionTriggerHandler.ts
  // calls this directly in response to FuelLogged events, not just the
  // batch detectFraud() entry point above. Single-vehicle path is
  // unchanged -- it's not the bottleneck, it's only ever called once
  // per event.
  async detectVehicleFraud(
    vehicleId: string,
    tenantId: string
  ): Promise<AIResult<FuelFraudAlert>> {
    try {
      const vehicle = await vehicleRepository.findById(vehicleId, tenantId);
      if (!vehicle) {
        return {
          success: false,
          error: 'Vehicle not found',
          timestamp: new Date(),
        };
      }

      const fuelLogs = await fuelRepository.findMany(
        { license_plate: vehicle.license_plate },
        tenantId,
        { limit: 100 }
      );

      return this.buildFraudAlert(vehicle, fuelLogs);
    } catch (error) {
      this.logError(`Failed to detect fraud for vehicle ${vehicleId}`, error as Error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date(),
      };
    }
  }

  /**
   * Pure, in-memory analysis extracted from what used to be the tail
   * end of detectVehicleFraud(). Takes already-fetched fuel logs so the
   * batch path (detectFraud) never has to hit the DB per vehicle.
   */
  private buildFraudAlert(vehicle: any, fuelLogs: any[]): AIResult<FuelFraudAlert> {
    const vehicleId = vehicle._id!;

    if (fuelLogs.length < 10) {
      return {
        success: false,
        error: 'Insufficient fuel data for analysis',
        timestamp: new Date(),
      };
    }

    const baseline = this.calculateBaseline(fuelLogs, vehicle);
    const anomalies = this.detectAnomalies(fuelLogs, baseline);
    const patterns = this.detectPatterns(fuelLogs, baseline);

    if (anomalies.length === 0 && patterns.length === 0) {
      return {
        success: false,
        error: 'No anomalies detected',
        timestamp: new Date(),
      };
    }

    const confidence = this.calculateConfidence([
      { weight: 0.4, value: Math.min(1, anomalies.length / 3) },
      { weight: 0.3, value: Math.min(1, patterns.length / 2) },
      { weight: 0.3, value: Math.min(1, fuelLogs.length / 50) },
    ]);

    const severity = this.determineSeverity(confidence, Math.min(1, anomalies.length / 5));

    const alert: FuelFraudAlert = {
      alertId: `fraud_${vehicleId}_${Date.now()}`,
      vehicleId,
      licensePlate: vehicle.license_plate,
      confidence,
      severity,
      timestamp: new Date(),
      anomalies,
      patterns,
      recommendation: this.generateRecommendation(anomalies, patterns),
      status: 'open',
    };

    this.logPrediction({
      vehicleId,
      licensePlate: vehicle.license_plate,
      anomalyCount: anomalies.length,
      patternCount: patterns.length,
      confidence,
    });

    return {
      success: true,
      data: alert,
      predictionId: alert.alertId,
      confidence,
      timestamp: new Date(),
    };
  }

  private calculateBaseline(fuelLogs: any[], vehicle: any): FuelBaseline {
    const totalVolume = fuelLogs.reduce((sum, f) => sum + f.fuel_volume, 0);
    const totalCost = fuelLogs.reduce((sum, f) => sum + f.cost, 0);
    const totalDistance = fuelLogs.reduce((sum, f) => sum + (f.odometer || 0), 0);

    const volumeValues = fuelLogs.map((f) => f.fuel_volume);
    const mean = totalVolume / fuelLogs.length;
    const squaredDiffs = volumeValues.map((v) => Math.pow(v - mean, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / fuelLogs.length;

    return {
      averageVolume: totalVolume / fuelLogs.length,
      averageCost: totalCost / fuelLogs.length,
      averageFrequency: totalDistance > 0 ? fuelLogs.length / (totalDistance / 1000) : 0,
      efficiency: totalVolume > 0 ? totalDistance / totalVolume : 0,
      standardDeviation: Math.sqrt(variance),
    };
  }

  private detectAnomalies(fuelLogs: any[], baseline: FuelBaseline): FuelAnomaly[] {
    const anomalies: FuelAnomaly[] = [];

    for (const log of fuelLogs) {
      const anomaly: FuelAnomaly = {
        type: 'fuel_volume',
        expected: baseline.averageVolume,
        actual: log.fuel_volume,
        deviation: 0,
        percentageDeviation: 0,
      };

      const deviation = log.fuel_volume - baseline.averageVolume;
      const percentageDeviation = baseline.averageVolume > 0 ? (deviation / baseline.averageVolume) * 100 : 0;

      anomaly.deviation = deviation;
      anomaly.percentageDeviation = percentageDeviation;

      if (Math.abs(percentageDeviation) > 30) {
        anomaly.type = percentageDeviation > 0 ? 'overconsumption' : 'underconsumption';
        anomalies.push(anomaly);
      }

      const costDeviation = log.cost - baseline.averageCost;
      const costPercentageDeviation = baseline.averageCost > 0 ? (costDeviation / baseline.averageCost) * 100 : 0;

      if (Math.abs(costPercentageDeviation) > 30) {
        const costAnomaly: FuelAnomaly = {
          type: 'cost',
          expected: baseline.averageCost,
          actual: log.cost,
          deviation: costDeviation,
          percentageDeviation: costPercentageDeviation,
        };
        anomalies.push(costAnomaly);
      }
    }

    const recentLogs = fuelLogs.slice(-5);
    const avgFrequency = recentLogs.reduce((sum, f, i, arr) => {
      if (i === 0) return 0;
      const days = (new Date(f.date).getTime() - new Date(arr[i-1].date).getTime()) / (1000 * 60 * 60 * 24);
      return sum + days;
    }, 0) / Math.max(1, recentLogs.length - 1);

    if (avgFrequency < 0.5) {
      anomalies.push({
        type: 'frequency',
        expected: 2,
        actual: avgFrequency,
        deviation: 0,
        percentageDeviation: 0,
      });
    }

    return anomalies;
  }

  private detectPatterns(fuelLogs: any[], baseline: FuelBaseline): FuelPattern[] {
    const patterns: FuelPattern[] = [];

    const weekly = this.analyzeWeeklyPattern(fuelLogs);
    if (weekly.confidence > 0.6) {
      patterns.push(weekly);
    }

    const monthly = this.analyzeMonthlyPattern(fuelLogs);
    if (monthly.confidence > 0.6) {
      patterns.push(monthly);
    }

    const location = this.analyzeLocationPattern(fuelLogs);
    if (location.confidence > 0.6) {
      patterns.push(location);
    }

    const vehicle = this.analyzeVehiclePattern(fuelLogs);
    if (vehicle.confidence > 0.6) {
      patterns.push(vehicle);
    }

    return patterns;
  }

  private analyzeWeeklyPattern(fuelLogs: any[]): FuelPattern {
    const dayCounts: Record<number, number> = {};
    for (const log of fuelLogs) {
      const day = new Date(log.date).getDay();
      dayCounts[day] = (dayCounts[day] || 0) + 1;
    }

    const maxDay = Object.entries(dayCounts).reduce((a, b) => a[1] > b[1] ? a : b);
    const confidence = maxDay[1] / fuelLogs.length;

    return {
      pattern: 'weekly',
      description: `Fuel purchases concentrated on ${['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][parseInt(maxDay[0])]}`,
      confidence: Math.min(1, confidence * 2),
    };
  }

  private analyzeMonthlyPattern(fuelLogs: any[]): FuelPattern {
    const weekCounts: Record<number, number> = {};
    for (const log of fuelLogs) {
      const week = Math.floor(new Date(log.date).getDate() / 7);
      weekCounts[week] = (weekCounts[week] || 0) + 1;
    }

    const maxWeek = Object.entries(weekCounts).reduce((a, b) => a[1] > b[1] ? a : b);
    const confidence = maxWeek[1] / fuelLogs.length;

    return {
      pattern: 'monthly',
      description: `Fuel purchases concentrated in week ${parseInt(maxWeek[0]) + 1} of month`,
      confidence: Math.min(1, confidence * 2),
    };
  }

  private analyzeLocationPattern(fuelLogs: any[]): FuelPattern {
    const locationCounts: Record<string, number> = {};
    for (const log of fuelLogs) {
      const key = log.station_name || 'Unknown';
      locationCounts[key] = (locationCounts[key] || 0) + 1;
    }

    const maxLocation = Object.entries(locationCounts).reduce((a, b) => a[1] > b[1] ? a : b);
    const confidence = maxLocation[1] / fuelLogs.length;

    return {
      pattern: 'location',
      description: `Fuel purchases concentrated at ${maxLocation[0]}`,
      confidence: Math.min(1, confidence * 2),
    };
  }

  private analyzeVehiclePattern(fuelLogs: any[]): FuelPattern {
    const avgVolume = fuelLogs.reduce((sum, f) => sum + f.fuel_volume, 0) / fuelLogs.length;
    const consistency = 1 - (fuelLogs.reduce((sum, f) => sum + Math.abs(f.fuel_volume - avgVolume), 0) / fuelLogs.length / avgVolume);

    return {
      pattern: 'vehicle',
      description: `Fuel volume consistency is ${(consistency * 100).toFixed(0)}%`,
      confidence: Math.min(1, consistency),
    };
  }

  private generateRecommendation(anomalies: FuelAnomaly[], patterns: FuelPattern[]): string {
    if (anomalies.some(a => a.type === 'overconsumption' || a.type === 'underconsumption')) {
      return 'Investigate fuel consumption anomalies - check for leaks, theft, or meter tampering';
    }

    if (anomalies.some(a => a.type === 'cost')) {
      return 'Review fuel costs for discrepancies - verify pricing and purchase records';
    }

    if (patterns.some(p => p.confidence > 0.8)) {
      return 'Review fuel purchase patterns - consider implementing fuel card controls';
    }

    return 'Monitor fuel consumption and continue anomaly detection';
  }
}

export const fuelFraudDetectionService = new FuelFraudDetectionService();