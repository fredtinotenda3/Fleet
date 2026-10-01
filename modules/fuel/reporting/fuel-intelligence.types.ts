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
//
// OPERATIONAL-CONNECTIVITY UPGRADE, PART 8: this primitive is no longer
// specific to the fuel report -- trips (distance), telematics (routing)
// and cross-module reporting now use the same vocabulary, so the
// definitions moved to shared/types/evidence.types.ts. Re-exported here
// verbatim so every existing import in this module (and its two
// generators) keeps working unchanged -- this file's behaviour is
// identical before and after, verified by diff.
// FIX: `export type { X } from '...'` re-exports X for OTHER modules to
// import from this file, but does NOT bring X into scope for use
// WITHIN this file -- every type below that references `Labeled<...>`
// was compiling against an undeclared name until this `import type`
// was added alongside the re-export (caught by `tsc --noEmit`, which
// is exactly the check this comment is here to explain to the next
// person wondering why both an import and an export of the same names
// appear together).
import type { FindingStatus, Labeled } from '@/shared/types/evidence.types';
export type { FindingStatus, Labeled };
export {
  fact,
  calculated,
  estimated,
  unavailable,
  dataQualityIssue,
} from '@/shared/types/evidence.types';

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
  /**
   * A second, independently-computed lens on the SAME reporting period:
   * fuel cost grouped by each vehicle's CURRENT Vehicle Operational Hub
   * driver assignment (Vehicle.currentDriverId) -- the same resolution
   * the Fuel Logs table and "Fuel cost by driver" chart use for
   * display. `currentAssignmentUnassignedCost`/`...SharePercent` is the
   * cost/share belonging to vehicles with NO current Hub driver.
   *
   * Deliberately shown SIDE BY SIDE with `unassignedCost`/
   * `unassignedSharePercent` above, never merged into them:
   * `unassignedCost` answers "how much of this period's fuel cost has
   * no driver recorded at the moment of entry" (transaction-time, the
   * permanent audit trail -- PART 4 requires this never be rewritten by
   * a later reassignment) while this answers "how much of this period's
   * fuel cost belongs to a vehicle with nobody currently assigned on
   * the Hub, right now" (a live operational snapshot that changes the
   * moment someone is assigned or unassigned). The two numbers will
   * usually differ, often by a lot -- that is expected and correct, not
   * a bug: most historical fuel logs were never stamped with a
   * driver_id at entry (drivers are assigned to VEHICLES via the Hub,
   * not stamped onto every past fuel purchase), so
   * unassignedSharePercent is typically high while
   * currentAssignmentUnassignedSharePercent is typically low on a fleet
   * with good Hub assignment hygiene.
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
