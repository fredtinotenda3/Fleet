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
  /**
   * 0-100, or `null` when no vehicle was scored.
   *
   * A mean over an empty fleet is undefined. Printing 0 into an ESG
   * disclosure would state, in a document handed to an insurer or an
   * auditor, that the fleet scored the worst possible health -- an
   * assertion about vehicles that do not exist.
   */
  overallScore: number | null;
  vehiclesAssessed: number;
  /** `null` when no vehicle records a model year. Never defaulted. */
  averageVehicleAgeYears: number | null;
  averageMileage: number;
  /** `null` when the fleet has logged no maintenance -- NOT 1.0, and not 0. */
  maintenanceCompletionRate: number | null;
  overdueMaintenanceCount: number;
  pendingMaintenanceCount: number;
  /**
   * Fleet km per litre, or `null` when it could not be measured for the
   * period. Nullable deliberately: this figure is printed into an ESG
   * disclosure PDF, and a fabricated 0.0 in a sustainability report is
   * a materially worse defect than the same 0.0 on a dashboard.
   */
  averageFuelEfficiency: number | null;
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
  /**
   * 0-100, or `null` when NO component could be measured.
   *
   * See esg-export.service.ts's computeCompositeScore. The weighting is
   * over the components that were actually measurable, and
   * `methodology` states which those were -- so the number in the PDF
   * and the sentence under it can never disagree.
   */
  value: number | null;
  methodology: string;
  /** Components excluded from the weighting because they were unmeasurable. */
  excludedComponents: string[];
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
