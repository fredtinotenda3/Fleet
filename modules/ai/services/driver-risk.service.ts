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
import { resolveOrganization } from '@/server/tenancy/organization-resolver';
import { TenantContext } from '@/modules/tenancy/services/tenant-context.service';
import { tenantScopeService } from '@/modules/tenancy/services/tenant-scope.service';
import { SPEEDING_THRESHOLD_KMH } from '@/modules/telematics/services/reading-alerts';

/**
 * PHASE 1, F-18: km/h over SPEEDING_THRESHOLD_KMH at which a speeding
 * incident is classified 'High' rather than 'Medium'. See
 * DriverRiskService.speedingSeverity for the reasoning.
 */
const HIGH_SEVERITY_MARGIN_KMH = 20;

export class DriverRiskService extends BaseAIService {
  protected readonly serviceName = 'DriverRisk';
  protected readonly predictionType = 'driver_risk';

  /**
   * Driver risk, now org-unit scoped the same way fleet-health is:
   * every read this service makes -- the driver roster itself, plus
   * each driver's trips and telematics -- is narrowed by the caller's
   * accessibleOrgUnitIds rather than computed org-wide and handed to
   * whoever asked.
   *
   * `context` optional: platform tooling and any nightly digest job
   * still want organization-wide risk scores with no context.
   *
   * KNOWN OPEN QUESTION (not fixed here, flagging rather than guessing):
   * this reads drivers from OrganizationMember (organization.members),
   * matching trips by member.userId === trip.driver_id. Elsewhere in
   * this codebase there's a dedicated tbldrivers collection
   * (modules/drivers) with its own scoped roster
   * (driverRepository.findAllInScope), and DriverSelect pickers in the
   * fuel module bind driver_id to THAT collection's _id, not a user's
   * userId. TripForm's own driver_id field, meanwhile, is a free-text
   * input, not bound to either. Depending on which shape driver_id
   * actually holds in your data, member.userId may never match a real
   * trip's driver_id, which would silently return zero trips (and a
   * default-safe score) for every driver regardless of scoping. I
   * don't have production data to check which case you're in, and
   * switching the source entity is a real behavior change, not a
   * mechanical scoping fix -- flagging this rather than guessing.
   */
  async calculateDriverRisk(
    tenantId: string,
    context?: TenantContext
  ): Promise<AIBatchResult<DriverRiskScore>> {
    try {
      const organization = await resolveOrganization(tenantId);
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

      const allMembers: OrganizationMember[] = organization.members || [];

      // Same fail-closed pattern as driver.tenancy-addendum.ts: a
      // member with no orgUnitId is invisible to a scope-narrowed
      // caller until assigned to an org unit, rather than defaulting
      // to visible.
      const drivers: OrganizationMember[] =
        context && context.accessibleOrgUnitIds !== null
          ? allMembers.filter(
              (m) =>
                (m as OrganizationMember & { orgUnitId?: string }).orgUnitId != null &&
                context.accessibleOrgUnitIds!.includes(
                  (m as OrganizationMember & { orgUnitId?: string }).orgUnitId!
                )
            )
          : allMembers;
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
          const score = await this.calculateSingleRisk(member, tenantId, context);
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
    tenantId: string,
    context?: TenantContext
  ): Promise<AIResult<DriverRiskScore>> {
    try {
      const scope = context
        ? (tenantScopeService.buildFilter(context, 'orgUnitId') as Record<string, unknown>)
        : {};

      const rawTrips = await tripRepository.findMany(
        { driver_id: driver.userId, ...scope } as never,
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

      const telematicsData = await this.getDriverTelematics(driver.userId, tenantId, context);

      const metrics = this.calculateRiskMetrics(driver, trips, telematicsData);

      const overallScore = this.calculateOverallScore(metrics);

      const riskLevel = this.determineRiskLevel(overallScore);

      const trends = this.generateRiskTrends(trips, telematicsData);

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
    tenantId: string,
    context?: TenantContext
  ): Promise<TelematicsEntity[]> {
    try {
      const scope = context
        ? (tenantScopeService.buildFilter(context, 'orgUnitId') as Record<string, unknown>)
        : {};

      const rawTrips = await tripRepository.findMany(
        { driver_id: driverId, ...scope } as never,
        tenantId
      );
      const vehicleIds = [...new Set(rawTrips.map((t) => t.license_plate).filter(Boolean))];

      if (vehicleIds.length === 0) return [];

      // FIX (medium -- N+1 query): this previously issued one
      // telematicsRepository.findMany() call per unique vehicle plate
      // this driver used, sequentially. For a driver who's touched many
      // vehicles (or a batch run across a whole fleet's drivers), that's
      // a lot of avoidable round-trips. Batched into a single $in query.
      // The overall cap approximates the previous per-vehicle limit:100
      // so total telematics volume pulled per driver doesn't change
      // materially, it's just fetched in one call instead of N.
      //
      // Also scoped: telematics rows carry their own orgUnitId (see
      // telematics.tenancy-addendum.ts), and a driver's vehicle-plate
      // set could in principle include a plate outside the caller's
      // accessible units if trips were scoped inconsistently -- the
      // scope predicate here is defense in depth on top of the
      // trip-level scoping above, not a substitute for it.
      const telematics = await telematicsRepository.findMany(
        { license_plate: { $in: vehicleIds }, ...scope } as never,
        tenantId,
        { limit: 100 * vehicleIds.length }
      );

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

  /**
   * FIX (high -- fabricated data): this used to generate 5 trend points
   * as `50 + (Math.random() - 0.5) * 30 + (i / 30) * 10` -- i.e. random
   * noise with a fake baked-in "improving over time" slope, completely
   * disconnected from the driver's actual telematics history.
   *
   * Now computes a real risk score per 7-day window from actual
   * telematics events (speeding/hard-brake/hard-accel) that fall within
   * that window, using the same calculateSafetyScore() used for the
   * driver's overall metrics -- inverted, since a trend of "risk over
   * time" should read higher when the driver is less safe. A window
   * with no telematics data scores 0 rather than inventing a value.
   */
  private generateRiskTrends(
    trips: TripEntity[],
    telematics: TelematicsEntity[]
  ): Array<{ date: Date; score: number }> {
    const trends: Array<{ date: Date; score: number }> = [];
    const now = new Date();

    for (let i = 28; i >= 0; i -= 7) {
      const windowEnd = new Date(now);
      windowEnd.setDate(windowEnd.getDate() - i);
      const windowStart = new Date(windowEnd);
      windowStart.setDate(windowStart.getDate() - 7);

      const windowTelematics = telematics.filter((t) => {
        const ts = new Date(t.timestamp);
        return ts >= windowStart && ts <= windowEnd;
      });

      const speedingEvents = windowTelematics.filter(
        (t) => t.location?.speed && t.location.speed > 120
      ).length;
      const hardBrakes = windowTelematics.filter(
        (t) => (t.alerts || []).some((a) => a.type === 'hard_brake')
      ).length;
      const hardAccelerations = windowTelematics.filter(
        (t) => (t.alerts || []).some((a) => a.type === 'hard_accel')
      ).length;

      const safetyScore = this.calculateSafetyScore(speedingEvents, hardBrakes, hardAccelerations);
      const riskScore = windowTelematics.length > 0 ? 100 - safetyScore : 0;

      trends.push({ date: windowEnd, score: Math.max(0, Math.min(100, Math.round(riskScore))) });
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

  /**
   * PHASE 1, F-18 -- how severe is a speeding incident?
   *
   * WHAT THIS REPLACES
   * ------------------
   *   severity: Math.random() > 0.7 ? 'High' : 'Medium',
   *
   * A driver's incident severity -- an input to a risk score that may
   * inform employment decisions -- was a coin flip. The same query
   * returned different severities on each call, so nothing about a
   * driver-risk report was reproducible: two managers reading the same
   * driver on the same data saw different answers, and neither could be
   * audited. Most of the fabricated data in this module was removed and
   * documented in an earlier round; this line survived.
   *
   * THE RULE
   * --------
   * Severity is the margin over the speeding threshold that raised the
   * incident in the first place:
   *
   *   speed >= SPEEDING_THRESHOLD_KMH + HIGH_SEVERITY_MARGIN_KMH -> 'High'
   *   otherwise                                                  -> 'Medium'
   *
   * Deliberately the simplest rule the data model supports. The only
   * evidence a TelematicsEntity carries about a speeding event is the
   * road speed on the reading (`t.location.speed`) -- there is no speed
   * limit for the road, no duration, no road class, and no repeat
   * count, because readings are point-in-time fixes with no event
   * aggregation. Any rule richer than "how far over" would need inputs
   * this codebase does not have, and inventing them is what produced
   * the defect being fixed.
   *
   * WHY 20 km/h
   * -----------
   * SPEEDING_THRESHOLD_KMH (120) is imported from
   * telematics/services/reading-alerts.ts rather than restated, so the
   * severity band cannot drift away from the threshold that decides
   * whether an incident exists at all -- a duplicated literal here
   * would silently produce incidents that are 'High' by definition, or
   * none that are, the first time the alert threshold moved.
   *
   * 20 km/h over is the point at which the reading stops being
   * explicable as flow-of-traffic or speedometer tolerance on a
   * motorway and becomes a deliberate choice. It also keeps the output
   * domain to exactly the two values the previous code emitted
   * ('High' | 'Medium'), so nothing downstream that switches on them
   * changes behaviour.
   *
   * The consequence worth stating plainly: incidents that were
   * previously 'High' 30% of the time at random are now 'High' if and
   * only if the vehicle was doing 140 km/h or more. Existing stored
   * risk scores computed under the random rule are not comparable with
   * new ones.
   */
  private speedingSeverity(speedKmh: number): 'High' | 'Medium' {
    return speedKmh >= SPEEDING_THRESHOLD_KMH + HIGH_SEVERITY_MARGIN_KMH
      ? 'High'
      : 'Medium';
  }

  private collectIncidents(trips: TripEntity[], telematics: TelematicsEntity[]): DriverRiskScore['incidents'] {
    const incidents: DriverRiskScore['incidents'] = [];

    // Add speeding incidents
    telematics.forEach((t: TelematicsEntity) => {
      if (t.location?.speed && t.location.speed > SPEEDING_THRESHOLD_KMH) {
        incidents.push({
          date: new Date(t.timestamp),
          type: 'Speeding',
          severity: this.speedingSeverity(t.location.speed),
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