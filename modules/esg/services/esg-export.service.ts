// modules/esg/services/esg-export.service.ts
//
// Builds the standardised Insurance/ESG data-sharing export: an
// aggregate snapshot of fleet health, driver risk, and compliance
// posture. Consumed by esg.controller.ts and rendered as JSON or PDF
// by esg-pdf.generator.ts.
//
// Scoping: like needs-attention.service.ts, this service adds no new
// reads of its own -- every read is an already org-unit-scoped call
// (fleetHealthService / driverRiskService / complianceService) with
// the caller's TenantContext forwarded straight through. See
// tests/security/esg-export-scope.spec.ts for the property this
// guarantees: a caller with restricted `accessibleOrgUnitIds` can never
// pull data for a vehicle or driver outside that scope into the
// exported file, because the underlying reads never saw it in the
// first place.

import { fleetHealthService } from '@/modules/ai/services/fleet-health.service';
import { driverRiskService } from '@/modules/ai/services/driver-risk.service';
import { complianceService } from '@/modules/compliance/services/compliance.service';
import type { TenantContext } from '@/modules/tenancy/services/tenant-context.service';
import type { ComplianceRecordStatus } from '@/modules/compliance/types/compliance.types';
import type {
  EsgComplianceSection,
  EsgDriverRiskSection,
  EsgExportData,
  EsgExportOptions,
  EsgFleetHealthSection,
} from '../types/esg-export.types';

const COMPLIANCE_STATUS_KEYS: ComplianceRecordStatus[] = ['pending', 'due_soon', 'overdue', 'resolved', 'waived'];

export class EsgExportService {
  async buildExport(
    tenantId: string,
    context: TenantContext,
    options: EsgExportOptions
  ): Promise<EsgExportData> {
    const [fleetHealth, driverRisk, compliance] = await Promise.all([
      this.buildFleetHealthSection(tenantId, context),
      this.buildDriverRiskSection(tenantId, context, options.includeDriverNames ?? false),
      this.buildComplianceSection(tenantId, context),
    ]);

    return {
      organization: { id: context.organizationId, name: context.organizationName },
      generatedAt: new Date(),
      scope: { orgUnitId: context.activeOrgUnitId ?? null },
      fleetHealth,
      driverRisk,
      compliance,
      compositeScore: this.computeCompositeScore(fleetHealth, driverRisk, compliance),
    };
  }

  private async buildFleetHealthSection(tenantId: string, context: TenantContext): Promise<EsgFleetHealthSection> {
    const result = await fleetHealthService.calculateHealthScore(tenantId, context);

    if (!result.success || !result.data) {
      return {
        // null, not 0 -- the "fleet health unavailable" branch, exactly
        // like averageFuelEfficiency below. 0/100 is a verdict.
        overallScore: null,
        vehiclesAssessed: 0,
        averageVehicleAgeYears: null,
        averageMileage: 0,
        maintenanceCompletionRate: null,
        overdueMaintenanceCount: 0,
        pendingMaintenanceCount: 0,
        // null, not 0 -- this is the "fleet health unavailable" branch,
        // which is not the same claim as "achieved 0 km/L".
        averageFuelEfficiency: null,
        recommendationCount: 0,
        estimatedRecommendedSpend: 0,
        byCategory: {},
      };
    }

    const data = result.data;
    const byCategory: Record<string, number> = {};
    let estimatedRecommendedSpend = 0;
    for (const rec of data.recommendations) {
      byCategory[rec.category] = (byCategory[rec.category] ?? 0) + 1;
      estimatedRecommendedSpend += rec.estimatedCost;
    }

    return {
      overallScore: data.overallScore,
      vehiclesAssessed: data.vehicleScores.length,
      averageVehicleAgeYears: data.metrics.averageVehicleAge,
      averageMileage: data.metrics.averageMileage,
      maintenanceCompletionRate: data.metrics.maintenanceCompletionRate,
      overdueMaintenanceCount: data.metrics.overdueMaintenanceCount,
      pendingMaintenanceCount: data.metrics.pendingMaintenanceCount,
      averageFuelEfficiency: data.metrics.fuelEfficiencyAverage,
      recommendationCount: data.recommendations.length,
      estimatedRecommendedSpend,
      byCategory,
    };
  }

  private async buildDriverRiskSection(
    tenantId: string,
    context: TenantContext,
    includeDriverNames: boolean
  ): Promise<EsgDriverRiskSection> {
    const batch = await driverRiskService.calculateDriverRisk(tenantId, context);
    const distribution = { low: 0, medium: 0, high: 0, critical: 0 };

    if (!batch.success) {
      return { driversAssessed: 0, averageScore: 0, distribution, highRiskDrivers: includeDriverNames ? [] : undefined };
    }

    const scores = batch.results.filter((r) => r.success && r.data).map((r) => r.data!);
    let scoreSum = 0;
    for (const s of scores) {
      distribution[s.riskLevel] += 1;
      scoreSum += s.overallScore;
    }

    const section: EsgDriverRiskSection = {
      driversAssessed: scores.length,
      averageScore: scores.length > 0 ? Math.round((scoreSum / scores.length) * 100) / 100 : 0,
      distribution,
    };

    if (includeDriverNames) {
      section.highRiskDrivers = scores
        .filter((s) => s.riskLevel === 'high' || s.riskLevel === 'critical')
        .map((s) => ({
          driverId: s.driverId,
          driverName: s.driverName,
          riskLevel: s.riskLevel,
          overallScore: s.overallScore,
        }));
    }

    return section;
  }

  private async buildComplianceSection(tenantId: string, context: TenantContext): Promise<EsgComplianceSection> {
    const [rules, page] = await Promise.all([
      complianceService.listRules(undefined, tenantId),
      complianceService.listInScope(undefined, undefined, { page: 1, limit: 500 }, context),
    ]);

    const ruleMap = new Map(rules.map((rule) => [rule._id, rule]));
    const byStatus = COMPLIANCE_STATUS_KEYS.reduce((acc, status) => {
      acc[status] = 0;
      return acc;
    }, {} as Record<ComplianceRecordStatus, number>);

    const overdueRecords: EsgComplianceSection['overdueRecords'] = [];

    for (const record of page.data) {
      byStatus[record.status] += 1;
      if (record.status === 'overdue') {
        overdueRecords.push({
          entityType: record.entityType,
          entityId: record.entityId,
          ruleName: ruleMap.get(record.ruleId)?.name ?? 'Unknown requirement',
          status: record.status,
          dueDate: record.dueDate,
        });
      }
    }

    const total = page.data.length;
    const compliant = total - byStatus.overdue;
    const complianceRate = total > 0 ? Math.round((compliant / total) * 10000) / 100 : 100;

    return {
      totalRulesInScope: rules.length,
      totalRecordsAssessed: total,
      byStatus,
      complianceRate,
      overdueRecords,
    };
  }

  /**
   * Weighted 0-100 composite: 40% fleet health, 30% compliance rate,
   * 30% driver-risk safety (inverted, since a lower risk-distribution
   * skew toward high/critical is better). This is a simple, disclosed
   * heuristic for a one-glance summary figure -- not a substitute for
   * the underlying sections, which is why `methodology` is included
   * alongside the number in every export.
   */
  private computeCompositeScore(
    fleetHealth: EsgFleetHealthSection,
    driverRisk: EsgDriverRiskSection,
    compliance: EsgComplianceSection
  ) {
    /*
      HONEST COMPOSITE.

      This previously read:

        driverSafety = driversAssessed > 0 ? ... : 100
        complianceRate = total > 0 ? ... : 100          (buildCompliance)
        value = fleetHealth * 0.4 + compliance * 0.3 + driverSafety * 0.3

      An organisation with no vehicles, no drivers and no compliance
      records therefore scored 0*0.4 + 100*0.3 + 100*0.3 = 60/100, and
      that 60 was printed into an ESG disclosure PDF as a measured
      sustainability figure. Every one of its three inputs was invented:
      two "perfect" scores for populations of zero, and one worst-possible
      score for a fleet that does not exist.

      A weighted mean is only defined over the terms that exist. So each
      component contributes only when it was actually measured, the
      weights are renormalised across those, and the methodology sentence
      names what was included AND what was excluded -- the number and the
      sentence beneath it cannot drift apart, because both are built here.
      With nothing measurable the answer is `null`, not a figure.
    */
    const components: Array<{ label: string; weight: number; score: number | null }> = [
      { label: 'fleet health score', weight: 0.4, score: fleetHealth.overallScore },
      {
        label: 'compliance rate',
        weight: 0.3,
        // `complianceRate` is 100 by construction when nothing was
        // assessed; that is "nothing to comply with", not compliance.
        score: compliance.totalRecordsAssessed > 0 ? compliance.complianceRate : null,
      },
      {
        label: 'driver safety',
        weight: 0.3,
        score:
          driverRisk.driversAssessed > 0
            ? 100 -
              ((driverRisk.distribution.high + driverRisk.distribution.critical) /
                driverRisk.driversAssessed) *
                100
            : null,
      },
    ];

    const measured = components.filter(
      (c): c is { label: string; weight: number; score: number } => c.score !== null
    );
    const excludedComponents = components.filter((c) => c.score === null).map((c) => c.label);

    if (measured.length === 0) {
      return {
        value: null,
        methodology:
          'Not measured. None of the three inputs (fleet health, compliance rate, ' +
          'driver safety) had any data to assess for this period.',
        excludedComponents,
      };
    }

    const totalWeight = measured.reduce((sum, c) => sum + c.weight, 0);
    const weighted = measured.reduce((sum, c) => sum + c.score * c.weight, 0) / totalWeight;

    const shares = measured
      .map((c) => `${Math.round((c.weight / totalWeight) * 100)}% ${c.label}`)
      .join(' + ');

    return {
      value: Math.max(0, Math.min(100, Math.round(weighted))),
      methodology:
        `${shares}. Driver safety is 100 minus the share of assessed drivers rated ` +
        'high/critical risk.' +
        (excludedComponents.length > 0
          ? ` Excluded as unmeasurable for this period: ${excludedComponents.join(', ')}; ` +
            'the remaining weights were renormalised to sum to 100%.'
          : ''),
      excludedComponents,
    };
  }
}

export const esgExportService = new EsgExportService();
