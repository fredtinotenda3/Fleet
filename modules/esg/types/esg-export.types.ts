// modules/esg/types/esg-export.types.ts
//
// Types for the Insurance/ESG data-sharing export: a standardised
// snapshot of fleet health, driver risk, and compliance data intended
// to leave the organization (handed to an insurer or used in ESG
// reporting). Because it leaves the organization, every field here is
// deliberately an aggregate or a named exception list rather than a
// raw dump of every entity -- see EsgExportOptions.includeDriverNames
// for the one place that distinction is a caller-controlled choice.

import type { ComplianceRecordStatus } from '@/modules/compliance/types/compliance.types';

export type EsgExportFormat = 'json' | 'pdf';

export interface EsgExportOptions {
  format: EsgExportFormat;
  /**
   * Named, per-driver risk rows are personal data. Default false: the
   * export includes only aggregate risk distribution. Callers who
   * explicitly opt in (e.g. an internal risk review, not a hand-off to
   * an external insurer) get the named high/critical-risk driver list
   * too. This is a data-minimization default, not a permissions check
   * -- permission to export is enforced separately by the controller.
   */
  includeDriverNames?: boolean;
}

export interface EsgFleetHealthSection {
  overallScore: number;
  vehiclesAssessed: number;
  averageVehicleAgeYears: number;
  averageMileage: number;
  maintenanceCompletionRate: number;
  overdueMaintenanceCount: number;
  pendingMaintenanceCount: number;
  averageFuelEfficiency: number;
  recommendationCount: number;
  estimatedRecommendedSpend: number;
  byCategory: Record<string, number>;
}

export interface EsgDriverRiskDistribution {
  low: number;
  medium: number;
  high: number;
  critical: number;
}

export interface EsgNamedDriverRisk {
  driverId: string;
  driverName: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  overallScore: number;
}

export interface EsgDriverRiskSection {
  driversAssessed: number;
  averageScore: number;
  distribution: EsgDriverRiskDistribution;
  /** Only populated when EsgExportOptions.includeDriverNames is true. */
  highRiskDrivers?: EsgNamedDriverRisk[];
}

export interface EsgComplianceRecordSummary {
  entityType: string;
  entityId: string;
  ruleName: string;
  status: ComplianceRecordStatus;
  dueDate?: Date;
}

export interface EsgComplianceSection {
  totalRulesInScope: number;
  totalRecordsAssessed: number;
  byStatus: Record<ComplianceRecordStatus, number>;
  complianceRate: number; // percentage of assessed records that are resolved/waived/pending (not overdue)
  overdueRecords: EsgComplianceRecordSummary[];
}

export interface EsgCompositeScore {
  /** 0-100. See esg-export.service.ts's computeCompositeScore for the weighting. */
  value: number;
  methodology: string;
}

export interface EsgExportData {
  organization: {
    id: string;
    name: string;
  };
  generatedAt: Date;
  scope: {
    /** null when the export covers the whole organization; otherwise the org unit the export was scoped to. */
    orgUnitId: string | null;
  };
  fleetHealth: EsgFleetHealthSection;
  driverRisk: EsgDriverRiskSection;
  compliance: EsgComplianceSection;
  compositeScore: EsgCompositeScore;
}
