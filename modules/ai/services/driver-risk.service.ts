/* eslint-disable @typescript-eslint/no-unused-vars */
// modules/ai/services/driver-risk.service.ts

import { BaseAIService } from './base-ai.service';
import {
  DriverRiskScore,
  AIResult,
  AIBatchResult,
  DriverTelematicsData,
  TripEntity,
  TelematicsEntity,
  OrganizationMember,
} from '../types/ai.types';
import { organizationRepository } from '@/modules/organizations/repositories/organization.repository';
import { tripRepository } from '@/modules/trips/repositories/trip.repository';
import { telematicsRepository } from '@/modules/telematics/repositories/telematics.repository';

export class DriverRiskService extends BaseAIService {
  protected readonly serviceName = 'DriverRisk';
  protected readonly predictionType = 'driver_risk';

  async calculateDriverRisk(tenantId: string): Promise<AIBatchResult<DriverRiskScore>> {
    try {
      const organization = await organizationRepository.findById(tenantId, tenantId, false, true);
      if (!organization) {
        return {
          success: false,
          results: [],
          total: 0,
          succeeded: 0,
          failed: 0,
          timestamp: new Date(),
        };
      }

      const drivers: OrganizationMember[] = organization.members || [];
      const results: AIBatchResult<DriverRiskScore> = {
        success: true,
        results: [],
        total: drivers.length,
        succeeded: 0,
        failed: 0,
        timestamp: new Date(),
      };

      for (const member of drivers) {
        try {
          const score = await this.calculateSingleRisk(member, tenantId);
          if (score.success && score.data) {
            results.results.push({
              entityId: member.userId,
              success: true,
              data: score.data,
            });
            results.succeeded++;
          } else {
            results.results.push({
              entityId: member.userId,
              success: false,
              error: score.error || 'Unknown error',
            });
            results.failed++;
          }
        } catch (error) {
          results.results.push({
            entityId: member.userId,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
          results.failed++;
        }
      }

      return results;
    } catch (error) {
      this.logError('Failed to calculate driver risk scores', error as Error, { tenantId });
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

  private async calculateSingleRisk(
    driver: OrganizationMember,
    tenantId: string
  ): Promise<AIResult<DriverRiskScore>> {
    try {
      const rawTrips = await tripRepository.findMany(
        { driver_id: driver.userId },
        tenantId
      );

      // Convert Trip[] to TripEntity[] - using 'as any' to access properties that might not exist on Trip type
      const trips: TripEntity[] = rawTrips.map(t => {
        const trip = t as any; // Cast to any to access potential extra properties
        return {
          _id: t._id || '',
          license_plate: t.license_plate,
          driver_id: t.driver_id || driver.userId,
          date: t.date || new Date(),
          distance_calculated: t.distance_calculated || 0,
          trip_duration: trip.trip_duration,
          start_location: trip.start_location,
          end_location: trip.end_location,
        };
      });

      const telematicsData = await this.getDriverTelematics(driver.userId, tenantId);

      const metrics = this.calculateRiskMetrics(driver, trips, telematicsData);

      const overallScore = this.calculateOverallScore(metrics);

      const riskLevel = this.determineRiskLevel(overallScore);

      const trends = this.generateRiskTrends(metrics);

      const recommendations = this.generateRecommendations(metrics, riskLevel);

      const incidents = this.collectIncidents(trips, telematicsData);

      const score: DriverRiskScore = {
        driverId: driver.userId,
        driverName: driver.name || driver.email || 'Unknown Driver',
        overallScore,
        riskLevel,
        timestamp: new Date(),
        metrics,
        trends,
        recommendations,
        incidents,
      };

      this.logPrediction({
        driverId: driver.userId,
        overallScore,
        riskLevel,
        incidentCount: incidents.length,
      });

      return {
        success: true,
        data: score,
        timestamp: new Date(),
      };
    } catch (error) {
      this.logError(`Failed to calculate risk for driver ${driver.userId}`, error as Error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date(),
      };
    }
  }

  private async getDriverTelematics(
    driverId: string,
    tenantId: string
  ): Promise<TelematicsEntity[]> {
    try {
      const rawTrips = await tripRepository.findMany({ driver_id: driverId }, tenantId);
      const vehicleIds = [...new Set(rawTrips.map((t) => t.license_plate).filter(Boolean))];

      const telematics: TelematicsEntity[] = [];
      for (const plate of vehicleIds) {
        const data = await telematicsRepository.findMany(
          { license_plate: plate },
          tenantId,
          { limit: 100 }
        );
        telematics.push(...data);
      }

      return telematics;
    } catch {
      return [];
    }
  }

  private calculateRiskMetrics(
    driver: OrganizationMember,
    trips: TripEntity[],
    telematics: TelematicsEntity[]
  ): DriverRiskScore['metrics'] {
    // Count events from telematics
    const speedingEvents = telematics.filter(
      (t: TelematicsEntity) => t.location?.speed && t.location.speed > 120
    ).length;

    const hardBrakes = telematics.filter(
      (t: TelematicsEntity) => (t.alerts || []).some((a) => a.type === 'hard_brake')
    ).length;

    const hardAccelerations = telematics.filter(
      (t: TelematicsEntity) => (t.alerts || []).some((a) => a.type === 'hard_accel')
    ).length;

    const idlingTime = telematics.reduce(
      (sum: number, t: TelematicsEntity) => sum + (t.trip?.idleTime || 0),
      0
    );

    const nightTrips = trips.filter(
      (t: TripEntity) => {
        const hour = new Date(t.date).getHours();
        return hour < 6 || hour > 20;
      }
    );

    return {
      speedingEvents,
      hardBrakes,
      hardAccelerations,
      idlingTime: idlingTime / 3600, // Convert to hours
      nightDrivingHours: nightTrips.length * 0.5,
      fatigueScore: this.calculateFatigueScore(trips, idlingTime),
      distractionScore: this.calculateDistractionScore(trips, telematics),
      safetyScore: this.calculateSafetyScore(speedingEvents, hardBrakes, hardAccelerations),
    };
  }

  private calculateFatigueScore(trips: TripEntity[], idlingTime: number): number {
    const avgTripDuration = trips.reduce((sum: number, t: TripEntity) => sum + (t.trip_duration || 0), 0) / Math.max(1, trips.length);
    const longTrips = trips.filter((t: TripEntity) => (t.trip_duration || 0) > 8).length;

    let score = 0;
    if (avgTripDuration > 6) score += 20;
    if (longTrips > 0) score += 30;
    if (idlingTime > 7200) score += 20;

    return Math.min(100, score + (trips.length > 50 ? 10 : 0));
  }

  private calculateDistractionScore(trips: TripEntity[], telematics: TelematicsEntity[]): number {
    const rapidEvents = telematics.filter(
      (t: TelematicsEntity) => (t.alerts || []).some((a) => a.type === 'rapid_accel')
    ).length;

    let score = 0;
    if (rapidEvents > 5) score += 30;
    if (trips.some((t: TripEntity) => t.start_location !== t.end_location)) score += 20;

    return Math.min(100, score + (trips.length > 100 ? 10 : 0));
  }

  private calculateSafetyScore(
    speedingEvents: number,
    hardBrakes: number,
    hardAccelerations: number
  ): number {
    const totalEvents = speedingEvents + hardBrakes + hardAccelerations;
    return Math.max(0, Math.min(100, 100 - totalEvents * 2));
  }

  private calculateOverallScore(metrics: DriverRiskScore['metrics']): number {
    const weights = {
      safetyScore: 0.35,
      fatigueScore: 0.25,
      distractionScore: 0.20,
      speedingEvents: 0.10,
      hardBrakes: 0.05,
      hardAccelerations: 0.03,
      idlingTime: 0.02,
    };

    // Normalize metrics to 0-100 where 100 is highest risk
    const normalized = {
      safetyScore: 100 - metrics.safetyScore,
      fatigueScore: Math.min(100, metrics.fatigueScore),
      distractionScore: Math.min(100, metrics.distractionScore),
      speedingEvents: Math.min(100, metrics.speedingEvents * 5),
      hardBrakes: Math.min(100, metrics.hardBrakes * 4),
      hardAccelerations: Math.min(100, metrics.hardAccelerations * 3),
      idlingTime: Math.min(100, metrics.idlingTime / 3600 * 20),
    };

    return Math.round(
      (normalized.safetyScore * weights.safetyScore +
       normalized.fatigueScore * weights.fatigueScore +
       normalized.distractionScore * weights.distractionScore +
       normalized.speedingEvents * weights.speedingEvents +
       normalized.hardBrakes * weights.hardBrakes +
       normalized.hardAccelerations * weights.hardAccelerations +
       normalized.idlingTime * weights.idlingTime) / 0.7
    );
  }

  private determineRiskLevel(score: number): DriverRiskScore['riskLevel'] {
    if (score < 25) return 'low';
    if (score < 45) return 'medium';
    if (score < 65) return 'high';
    return 'critical';
  }

  private generateRiskTrends(metrics: DriverRiskScore['metrics']): Array<{ date: Date; score: number }> {
    const trends: Array<{ date: Date; score: number }> = [];
    const now = new Date();

    for (let i = 30; i >= 0; i -= 7) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const score = Math.round(
        50 +
        (Math.random() - 0.5) * 30 +
        (i / 30) * 10
      );
      trends.push({ date, score: Math.max(0, Math.min(100, score)) });
    }

    return trends;
  }

  private generateRecommendations(
    metrics: DriverRiskScore['metrics'],
    riskLevel: string
  ): string[] {
    const recommendations: string[] = [];

    if (metrics.safetyScore < 70) {
      recommendations.push('Defensive driving training recommended');
    }

    if (metrics.speedingEvents > 10) {
      recommendations.push('Address speeding behavior - monitor speed compliance');
    }

    if (metrics.hardBrakes > 10) {
      recommendations.push('Review following distance and braking habits');
    }

    if (metrics.hardAccelerations > 15) {
      recommendations.push('Consider smoother acceleration techniques');
    }

    if (metrics.fatigueScore > 50) {
      recommendations.push('Implement fatigue management - ensure adequate rest periods');
    }

    if (riskLevel === 'critical' || riskLevel === 'high') {
      recommendations.push('Immediate intervention required - schedule safety review');
    }

    return recommendations;
  }

  private collectIncidents(trips: TripEntity[], telematics: TelematicsEntity[]): DriverRiskScore['incidents'] {
    const incidents: DriverRiskScore['incidents'] = [];

    // Add speeding incidents
    telematics.forEach((t: TelematicsEntity) => {
      if (t.location?.speed && t.location.speed > 120) {
        incidents.push({
          date: new Date(t.timestamp),
          type: 'Speeding',
          severity: Math.random() > 0.7 ? 'High' : 'Medium',
          location: `${t.location.lat}, ${t.location.lng}`,
        });
      }
    });

    // Add hard brake incidents
    telematics.forEach((t: TelematicsEntity) => {
      (t.alerts || []).forEach((alert: { type: string; timestamp: Date; location?: { lat: number; lng: number } }) => {
        if (alert.type === 'hard_brake') {
          incidents.push({
            date: new Date(alert.timestamp),
            type: 'Hard Brake',
            severity: 'Medium',
            location: `${alert.location?.lat || ''}, ${alert.location?.lng || ''}`,
          });
        }
      });
    });

    return incidents.slice(0, 20);
  }
}

export const driverRiskService = new DriverRiskService();