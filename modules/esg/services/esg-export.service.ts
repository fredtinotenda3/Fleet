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
        overallScore: 0,
        vehiclesAssessed: 0,
        averageVehicleAgeYears: 0,
        averageMileage: 0,
        maintenanceCompletionRate: 0,
        overdueMaintenanceCount: 0,
        pendingMaintenanceCount: 0,
        averageFuelEfficiency: 0,
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
    const driverSafetyScore =
      driverRisk.driversAssessed > 0
        ? 100 -
          ((driverRisk.distribution.high + driverRisk.distribution.critical) / driverRisk.driversAssessed) * 100
        : 100;

    const value = Math.round(
      fleetHealth.overallScore * 0.4 + compliance.complianceRate * 0.3 + driverSafetyScore * 0.3
    );

    return {
      value: Math.max(0, Math.min(100, value)),
      methodology:
        '40% fleet health score + 30% compliance rate + 30% driver safety ' +
        '(100 minus the share of assessed drivers rated high/critical risk).',
    };
  }
}

export const esgExportService = new EsgExportService();
