// frontend/modules/fuel/types/fuelIntelligence.types.ts
//
// Frontend mirror of modules/fuel/reporting/fuel-intelligence.types.ts.
// Kept as a deliberate, separate type definition (not a shared import
// across the client/server boundary, matching every other module's
// FE type file in this codebase) with one intentional difference:
// `generatedAt`, `period.start` and `period.end` are `string`, not
// `Date` -- the backend's `Date` objects serialize to ISO strings over
// JSON, and typing them as `Date` here would be a lie the compiler
// can't catch.
//
// See that file's own header comment for the full FACT/CALCULATED/
// ESTIMATED/UNAVAILABLE/DATA_QUALITY_ISSUE rationale (PART 16) -- it
// applies identically here. Every `Labeled<T>` value in this report
// MUST be rendered through the shared LabeledValue/LabeledMetric
// components (see components/FuelIntelligenceReport/), never by
// reading `.value` directly, so a status is never silently dropped.

export type FindingStatus = 'FACT' | 'CALCULATED' | 'ESTIMATED' | 'UNAVAILABLE' | 'DATA_QUALITY_ISSUE';

export interface Labeled<T> {
  status: FindingStatus;
  value: T | null;
  reason?: string;
}

export interface Finding {
  id: string;
  what: string;
  why: string;
  impact: Labeled<string>;
  action?: string;
  how?: string;
  prevention?: string;
  owner?: string;
  monitor?: string;
  severity: 'info' | 'attention' | 'urgent';
}

export interface ReportPeriod {
  month: string;
  label: string;
  start: string;
  end: string;
}

export interface MonthOverMonthMetric {
  label: string;
  unit: string;
  current: Labeled<number>;
  previous: Labeled<number>;
  delta: Labeled<number>;
  deltaPercent: Labeled<number>;
  direction: 'up' | 'down' | 'flat' | 'unavailable';
  possibleExplanation: Labeled<string>;
}

export interface FleetPositionSection {
  totalFuelCost: Labeled<number>;
  totalLitres: Labeled<number>;
  logCount: Labeled<number>;
  vehiclesActive: Labeled<number>;
  averageCostPerLitre: Labeled<number>;
  currency: string;
}

export interface WhatChangedSection {
  hasComparisonPeriod: boolean;
  comparisonPeriodLabel?: string;
  metrics: MonthOverMonthMetric[];
}

export interface CostDriverRow {
  license_plate: string;
  totalCost: Labeled<number>;
  totalLitres: Labeled<number>;
  logCount: Labeled<number>;
  shareOfFleetCostPercent: Labeled<number>;
  classification: 'high_cost' | 'abnormal_cost' | 'normal';
  abnormalReason?: string;
}

export interface CostDriverSection {
  rows: CostDriverRow[];
  topVehicleConcentration: Labeled<{ vehicleCount: number; costSharePercent: number }>;
}

export interface DriverFindingRow {
  driver_id: string | null;
  driverName: string;
  totalCost: Labeled<number>;
  totalLitres: Labeled<number>;
  logCount: Labeled<number>;
  vehicleCount: Labeled<number>;
}

export interface DriverFindingsSection {
  rows: DriverFindingRow[];
  unassignedCost: Labeled<number>;
  unassignedSharePercent: Labeled<number>;
  attributionNote: string;
  /**
   * Second, independently-computed lens on the same period: fuel cost
   * grouped by each vehicle's CURRENT Vehicle Hub driver assignment
   * (the same resolution the Fuel Logs table/chart use for display),
   * shown alongside -- never merged into -- the transaction-time
   * figures above. See the backend's DriverFindingsSection doc comment
   * (modules/fuel/reporting/fuel-intelligence.types.ts) for the full
   * rationale.
   */
  currentAssignmentUnassignedCost: Labeled<number>;
  currentAssignmentUnassignedSharePercent: Labeled<number>;
  currentAssignmentNote: string;
}

export interface FuelTypeMixRow {
  fuelType: string;
  litres: Labeled<number>;
  cost: Labeled<number>;
  percentage: Labeled<number>;
}

export interface AbnormalEventRow {
  _id: string;
  license_plate: string;
  date: string;
  volume: number;
  anomalyScore: number;
  threshold: number;
}

export interface AbnormalFindingsSection {
  volumeAnomalies: AbnormalEventRow[];
  volumeAnomalyBasis: string;
  vehicleCostSpikes: CostDriverRow[];
}

export interface AllocationReconciliationSection {
  operationalTotal: Labeled<number>;
  ledgerTotal: Labeled<number>;
  variance: Labeled<number>;
  variancePercent: Labeled<number>;
  reconciled: boolean | null;
  note: string;
}

export interface DataQualityMetric {
  label: string;
  affectedCount: number;
  totalCount: number;
  percent: number;
  severity: 'info' | 'attention' | 'urgent';
  detail: string;
}

export interface DataQualitySection {
  totalLogsInPeriod: number;
  truncated: boolean;
  metrics: DataQualityMetric[];
  overallAssessment: 'good' | 'fair' | 'poor' | 'insufficient_data';
}

export interface MonthlyFuelIntelligenceReport {
  organization: { id: string; name: string };
  scope: { orgUnitId: string | null };
  generatedAt: string;
  period: ReportPeriod;
  fleetPosition: FleetPositionSection;
  whatChanged: WhatChangedSection;
  costDrivers: CostDriverSection;
  driverFindings: DriverFindingsSection;
  fuelTypeMix: FuelTypeMixRow[];
  abnormalFindings: AbnormalFindingsSection;
  allocationReconciliation: AllocationReconciliationSection;
  dataQuality: DataQualitySection;
  findings: Finding[];
}

export type FuelIntelligenceReportFormat = 'json' | 'excel' | 'pdf';
