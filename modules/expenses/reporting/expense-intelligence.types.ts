// modules/expenses/reporting/expense-intelligence.types.ts
//
// Shape of the Monthly Expense Intelligence Report -- mirrors
// modules/fuel/reporting/fuel-intelligence.types.ts (the Monthly Fuel &
// Fleet Intelligence Report), built at the same "every number carries a
// status" discipline that report established. See
// monthly-expense-intelligence.service.ts's header for what was kept,
// what was adapted, and what was deliberately left out.
//
// EVERY NUMBER IN THIS REPORT CARRIES A STATUS -- same five states as
// the fuel report, same meaning:
//
//   FACT             -- read directly from a source record.
//   CALCULATED       -- derived from FACT data by a disclosed, fixed
//                        formula (a percentage, a ratio, a MoM delta).
//   ESTIMATED        -- would require an assumption this report is not
//                        willing to make silently.
//   UNAVAILABLE      -- the data needed does not exist for this period/
//                        scope. `value` is always `null`.
//   DATA_QUALITY_ISSUE -- the data exists but is incomplete or fails a
//                        validation check the platform already enforces.
//
// A Labeled<T> value is never rendered without checking `status` first.
//
// NOT SHARED with fuel-intelligence.types.ts. The primitives below
// (Labeled<T>, the five constructors, Finding, ReportPeriod,
// MonthOverMonthMetric) are byte-for-byte identical in intent to their
// fuel counterparts and are genuinely domain-agnostic -- an argument for
// extracting them to one shared reporting-primitives module both reports
// import from, consistent with this codebase's own "do not create a
// second reporting architecture" principle (see the fuel service's
// header). Deliberately NOT done here: that refactor would need to touch
// monthly-fuel-intelligence.service.ts, fuel-intelligence-pdf.generator.ts
// and fuel-intelligence-excel.generator.ts -- already-shipped, tested
// code nobody asked to have touched in this change. Duplicating this one
// small, stable block keeps this delivery's blast radius at zero on the
// fuel report. Worth revisiting as a follow-up if a second mirror is
// ever built after this one (three copies is where duplication stops
// being the cheaper option).

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
// Every finding answers WHAT / WHY / IMPACT / ACTION / HOW / PREVENTION
// / OWNER (only if genuinely identifiable) / MONITOR -- identical
// contract to the fuel report's Finding.
// ---------------------------------------------------------------------
export interface Finding {
  id: string;
  /** WHAT happened, in one sentence a director can read without context. */
  what: string;
  /** WHY it matters to fleet management -- the business consequence, not a restatement of `what`. */
  why: string;
  /** The measurable IMPACT, labeled -- may be UNAVAILABLE if it cannot be quantified honestly. */
  impact: Labeled<string>;
  /** WHAT should be done. Omitted (not fabricated) when no responsible action is implied by the finding itself. */
  action?: string;
  /** HOW to implement the action, when `action` is present. */
  how?: string;
  /** HOW to prevent recurrence. */
  prevention?: string;
  /**
   * WHO/WHICH AREA is responsible, ONLY when the data itself identifies
   * one (a specific vehicle, a specific branch/org unit). Never a
   * fabricated person. Omitted, never a placeholder, when not
   * identifiable. There is deliberately no driver-level `owner` here --
   * see this report's header on why driver findings are out of scope.
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

/**
 * Fleet Position equivalent. No `currency` averaging claim beyond what
 * fuel's own FleetPositionSection makes -- see its identical caveat: the
 * platform does not cross-currency-normalize expenses at report time,
 * so this total is only meaningful when the fleet's expenses are
 * recorded in one currency (true for this tenant today).
 */
export interface ExpensePositionSection {
  totalExpenseCost: Labeled<number>;
  transactionCount: Labeled<number>;
  vehiclesWithExpenses: Labeled<number>;
  averageCostPerTransaction: Labeled<number>;
  currency: string;
}

export interface WhatChangedSection {
  hasComparisonPeriod: boolean;
  comparisonPeriodLabel?: string;
  metrics: MonthOverMonthMetric[];
}

/**
 * Cost Driver row -- mirrors fuel's CostDriverRow with `totalLitres`
 * dropped (expenses have no volume dimension) and `transactionCount` in
 * its place.
 */
export interface ExpenseCostDriverRow {
  license_plate: string;
  totalCost: Labeled<number>;
  transactionCount: Labeled<number>;
  shareOfFleetCostPercent: Labeled<number>;
  classification: 'high_cost' | 'abnormal_cost' | 'normal';
  /** Present only when classification is abnormal_cost. */
  abnormalReason?: string;
}

export interface CostDriverSection {
  rows: ExpenseCostDriverRow[];
  /** Concentration: what % of fleet expense cost the top N vehicles account for. */
  topVehicleConcentration: Labeled<{ vehicleCount: number; costSharePercent: number }>;
}

/**
 * Category Mix -- the direct equivalent of fuel's FuelTypeMixRow, using
 * the expense module's existing category (ExpenseType.category /
 * ExpenseType.name) dimension the same way FuelTypeMixRow uses
 * fuel_type. Unlike fuel type, an expense category summary already
 * exists in ExpenseRepository.getExpenseCategorySummary with its own
 * MoM change built in, so this row carries that too -- fuel's mix row
 * has no MoM column because getFuelTypeDistribution never computed one.
 */
export interface CategoryMixRow {
  category: string;
  cost: Labeled<number>;
  count: Labeled<number>;
  percentage: Labeled<number>;
  momChangePercent: Labeled<number>;
}

/**
 * Abnormal Findings -- fuel flags individual fill-ups whose VOLUME
 * exceeds a vehicle's own historical average by a fixed multiplier.
 * Expenses have no equivalent physical-volume signal, so this section
 * uses ExpenseRepository.getExpenseOutliers instead: individual
 * transactions whose AMOUNT is a statistical outlier (z-score) against
 * their own category's mean/stddev for the period -- a more rigorous
 * basis than a fixed multiplier would be here, and it was already built
 * and available rather than invented for this report.
 */
export interface ExpenseOutlierFindingRow {
  _id: string;
  license_plate: string;
  category: string;
  date: string;
  amount: number;
  categoryMean: number;
  categoryStdDev: number;
  zScore: number;
}

export interface AbnormalFindingsSection {
  amountOutliers: ExpenseOutlierFindingRow[];
  outlierBasis: string;
  vehicleCostSpikes: ExpenseCostDriverRow[];
}

/** Identical shape to fuel's AllocationReconciliationSection -- same allocation ledger, different cost category ('expense' instead of 'fuel'). */
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
  totalTransactionsInPeriod: number;
  truncated: boolean;
  metrics: DataQualityMetric[];
  overallAssessment: 'good' | 'fair' | 'poor' | 'insufficient_data';
}

export interface MonthlyExpenseIntelligenceReport {
  organization: { id: string; name: string };
  scope: { orgUnitId: string | null };
  generatedAt: Date;
  period: ReportPeriod;
  expensePosition: ExpensePositionSection;
  whatChanged: WhatChangedSection;
  costDrivers: CostDriverSection;
  categoryMix: CategoryMixRow[];
  abnormalFindings: AbnormalFindingsSection;
  allocationReconciliation: AllocationReconciliationSection;
  dataQuality: DataQualitySection;
  findings: Finding[];
}
