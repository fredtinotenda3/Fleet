// modules/fuel/reporting/fuel-intelligence.types.ts
//
// PART 5-8, 16 ("Monthly Director Reporting" / "Do not overstate
// insights"). Shape of the Monthly Fuel & Fleet Intelligence Report --
// the report monthly-fuel-intelligence.service.ts builds and both
// fuel-intelligence-excel.generator.ts and fuel-intelligence-pdf.generator.ts
// render.
//
// EVERY NUMBER IN THIS REPORT CARRIES A STATUS. This is the single most
// important structural decision in this file, directly implementing
// PART 16's instruction: never present a derived, estimated, or missing
// figure as if it were a directly observed one.
//
//   FACT             -- read directly from a source record (a stored
//                        total, a count, a literal field value). Nothing
//                        was computed beyond summing/grouping what is
//                        already there.
//   CALCULATED       -- mathematically derived from FACT data using a
//                        disclosed, deterministic formula (a percentage,
//                        a ratio, a month-over-month delta). Always
//                        reproducible from the underlying facts.
//   ESTIMATED        -- would require an assumption this report is not
//                        willing to make silently (e.g. "distance
//                        travelled" inferred from odometer deltas that
//                        span a data gap). Used sparingly, and always
//                        paired with `reason` explaining the assumption.
//   UNAVAILABLE      -- the data needed does not exist for this period/
//                        scope. `value` is always `null`. `reason` says
//                        what is missing, in the exact style PART 16
//                        asked for ("Cost per km: Unavailable — Reason:
//                        Reliable distance data is not available for
//                        this reporting period.").
//   DATA_QUALITY_ISSUE -- the data exists but is incomplete, inconsistent,
//                        or fails a validation check the platform already
//                        enforces elsewhere (e.g. a ledger total that
//                        does not reconcile with the operational total).
//                        `value` may be present (the number that was
//                        computed despite the issue) but must be read
//                        alongside `reason`.
//
// A Labeled<T> value is never rendered without checking `status` first --
// see both generators' formatLabeled() helpers.

export type FindingStatus = 'FACT' | 'CALCULATED' | 'ESTIMATED' | 'UNAVAILABLE' | 'DATA_QUALITY_ISSUE';

export interface Labeled<T> {
  status: FindingStatus;
  value: T | null;
  /** Required when status is UNAVAILABLE, ESTIMATED or DATA_QUALITY_ISSUE. Optional (but encouraged) for FACT/CALCULATED. */
  reason?: string;
}

export function fact<T>(value: T): Labeled<T> {
  return { status: 'FACT', value };
}
export function calculated<T>(value: T, reason?: string): Labeled<T> {
  return { status: 'CALCULATED', value, reason };
}
export function estimated<T>(value: T, reason: string): Labeled<T> {
  return { status: 'ESTIMATED', value, reason };
}
export function unavailable<T = never>(reason: string): Labeled<T> {
  return { status: 'UNAVAILABLE', value: null, reason };
}
export function dataQualityIssue<T>(value: T | null, reason: string): Labeled<T> {
  return { status: 'DATA_QUALITY_ISSUE', value, reason };
}

// ---------------------------------------------------------------------
// PART 13: every finding answers WHAT / WHY / IMPACT / ACTION / HOW /
// PREVENTION / OWNER (only if genuinely identifiable) / MONITOR.
// ---------------------------------------------------------------------
export interface Finding {
  id: string;
  /** WHAT happened, in one sentence a director can read without context. */
  what: string;
  /** WHY it matters to fleet management -- the business consequence, not a restatement of `what`. */
  why: string;
  /** The measurable IMPACT, labeled -- may be UNAVAILABLE if it cannot be quantified honestly. */
  impact: Labeled<string>;
  /** WHAT should be done. Omitted (not fabricated) when no responsible action is implied by the finding itself (e.g. a purely informational data-quality note). */
  action?: string;
  /** HOW to implement the action, when `action` is present. */
  how?: string;
  /** HOW to prevent recurrence. */
  prevention?: string;
  /**
   * WHO/WHICH AREA is responsible, ONLY when the data itself identifies
   * one (a specific vehicle, a specific branch/org unit, a specific
   * driver whose attribution is not itself in question). Never a
   * fabricated person. Omitted, never a placeholder, when not
   * identifiable.
   */
  owner?: string;
  /** WHAT to monitor next month to see if this resolved or recurred. */
  monitor?: string;
  severity: 'info' | 'attention' | 'urgent';
}

export interface ReportPeriod {
  /** 'YYYY-MM' */
  month: string;
  label: string;
  start: Date;
  end: Date;
}

export interface MonthOverMonthMetric {
  label: string;
  unit: string;
  current: Labeled<number>;
  previous: Labeled<number>;
  /** current - previous, CALCULATED only when both current and previous are FACT/CALCULATED. */
  delta: Labeled<number>;
  /** percentage change, same availability rule as delta. */
  deltaPercent: Labeled<number>;
  direction: 'up' | 'down' | 'flat' | 'unavailable';
  /** A specific, corroborated explanation (points at another metric in this same report), or UNAVAILABLE -- never a guessed cause. */
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
  /** Present only when classification is abnormal_cost. */
  abnormalReason?: string;
}

export interface CostDriverSection {
  rows: CostDriverRow[];
  /** Concentration: what % of fleet fuel cost the top N vehicles account for. */
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
  generatedAt: Date;
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
