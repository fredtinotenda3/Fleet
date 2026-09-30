// frontend/modules/expenses/types/expenseIntelligence.types.ts
//
// Frontend mirror of modules/expenses/reporting/expense-intelligence.types.ts.
// Kept as a deliberate, separate type definition (not a shared import
// across the client/server boundary), matching
// frontend/modules/fuel/types/fuelIntelligence.types.ts's own precedent
// exactly -- including its one intentional difference: `generatedAt`,
// `period.start` and `period.end` are `string`, not `Date` -- the
// backend's `Date` objects serialize to ISO strings over JSON, and
// typing them as `Date` here would be a lie the compiler can't catch.
//
// See the backend file's own header for the full FACT/CALCULATED/
// ESTIMATED/UNAVAILABLE/DATA_QUALITY_ISSUE rationale -- it applies
// identically here. Every `Labeled<T>` value in this report MUST be
// rendered through the shared LabeledValue/LabeledMetric components
// (see components/ExpenseIntelligenceReport/), never by reading
// `.value` directly, so a status is never silently dropped.
//
// NO DRIVER SECTION. Unlike the fuel report's DriverFindingsSection,
// there is no expense equivalent -- Expense has no driver field at
// all, and this was an explicit scoping decision made with the client
// (see monthly-expense-intelligence.service.ts's header), not an
// oversight.

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

export interface ExpenseCostDriverRow {
  license_plate: string;
  totalCost: Labeled<number>;
  transactionCount: Labeled<number>;
  shareOfFleetCostPercent: Labeled<number>;
  classification: 'high_cost' | 'abnormal_cost' | 'normal';
  abnormalReason?: string;
}

export interface CostDriverSection {
  rows: ExpenseCostDriverRow[];
  topVehicleConcentration: Labeled<{ vehicleCount: number; costSharePercent: number }>;
}

export interface CategoryMixRow {
  category: string;
  cost: Labeled<number>;
  count: Labeled<number>;
  percentage: Labeled<number>;
  momChangePercent: Labeled<number>;
}

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
  generatedAt: string;
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

/**
 * "excel"/"pdf" are recognized by the backend but currently return 501
 * Not Implemented (see expense-intelligence.controller.ts) -- this
 * phase's UI deliberately only wires up "json". The type still names
 * all three so the API client's request shape doesn't need to change
 * again once the generators ship.
 */
export type ExpenseIntelligenceReportFormat = 'json' | 'excel' | 'pdf';
