// modules/expenses/reporting/expense-intelligence.utils.ts
//
// Pure, DB-free calculation functions behind the Monthly Expense
// Intelligence Report (monthly-expense-intelligence.service.ts) --
// mirrors modules/fuel/reporting/fuel-intelligence.utils.ts (see that
// file's header for the reasoning: extracted as plain functions so the
// report's actual decision logic is unit-testable without mocking
// MongoDB). See expense-intelligence.types.ts's header for why this is
// a deliberate, scoped duplication of the fuel utils rather than a
// shared import.
//
// HIGH COST vs ABNORMAL COST: same distinction as fuel's cost driver
// classification. HIGH COST is a RANKING (this vehicle currently costs a
// lot relative to the rest of the fleet -- may be entirely legitimate).
// ABNORMAL COST is a CHANGE (this vehicle's spend moved sharply against
// its OWN recent baseline). A vehicle can be one, both, or neither.
//
// Every threshold below is a named exported constant with a comment
// explaining why that specific number, same discipline as the fuel
// utils -- and, where a fuel threshold's rationale applies unchanged to
// expenses, the SAME NUMBER is reused rather than picking a different
// one for no reason.

import type {
  DataQualityMetric,
  DataQualitySection,
  ExpenseCostDriverRow,
  Labeled,
  MonthOverMonthMetric,
  ReportPeriod,
} from './expense-intelligence.types';

// ---------------------------------------------------------------------
// Thresholds -- documented, configurable, never silently hard-coded.
// ---------------------------------------------------------------------

/** Same rationale and same value as fuel's HIGH_COST_TOP_PERCENT -- see that constant's doc comment in fuel-intelligence.utils.ts. Not a statistically derived cutoff; a familiar Pareto-style framing. */
export const HIGH_COST_TOP_PERCENT = 0.2;

/**
 * A vehicle's expense cost is "abnormal" (month-over-month) if it
 * increased by at least this multiple AND by at least
 * ABNORMAL_COST_MATERIALITY_FLOOR in absolute terms versus its own
 * previous-period cost. Same 1.5x as fuel's ABNORMAL_COST_SPIKE_MULTIPLIER
 * -- the rationale (total cost at this level of aggregation has lower
 * variance than a single transaction, so a smaller multiple than a
 * single-fill-up-style 2x is still a genuine outlier) applies identically
 * to monthly expense totals.
 */
export const ABNORMAL_COST_SPIKE_MULTIPLIER = 1.5;

/** Same rationale as fuel's ABNORMAL_COST_MATERIALITY_FLOOR: a vehicle going from $2 to $4 ("100% increase") is noise, not a finding. Currency-unit-agnostic, same caveat as fuel's. */
export const ABNORMAL_COST_MATERIALITY_FLOOR = 50;

/** A ledger vs. operational total variance below this is treated as reconciled (rounding/timing noise). Same value as fuel's ALLOCATION_RECONCILIATION_MATERIALITY_PERCENT. */
export const ALLOCATION_RECONCILIATION_MATERIALITY_PERCENT = 1;

/** Data-quality field-completeness thresholds for the overall assessment rollup. Same values as fuel's. */
export const DATA_QUALITY_GOOD_MAX_ISSUE_PERCENT = 5;
export const DATA_QUALITY_FAIR_MAX_ISSUE_PERCENT = 20;

/** Z-score threshold for an individual transaction to be flagged as an amount outlier -- matches ExpenseRepository.getExpenseOutliers' own default, so this report's Abnormal Findings section shows exactly what that method already flags rather than a second, differently-tuned threshold. */
export const EXPENSE_OUTLIER_Z_THRESHOLD = 2.5;

// ---------------------------------------------------------------------
// Period resolution -- byte-identical logic to fuel's, UTC-anchored for
// the same reason (report boundaries must not shift with server/browser
// timezone).
// ---------------------------------------------------------------------

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function resolveReportPeriod(month: string): ReportPeriod {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) {
    throw new Error(`Invalid report month "${month}". Expected "YYYY-MM".`);
  }
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1; // 0-based
  if (monthIndex < 0 || monthIndex > 11) {
    throw new Error(`Invalid report month "${month}". Month must be 01-12.`);
  }

  const start = new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, monthIndex + 1, 1, 0, 0, 0, 0) - 1);

  return {
    month,
    label: `${MONTH_NAMES[monthIndex]} ${year}`,
    start,
    end,
  };
}

/** The previous calendar month's period, for month-over-month comparison. */
export function resolvePreviousPeriod(period: ReportPeriod): ReportPeriod {
  const prevMonthIndex = period.start.getUTCMonth() - 1;
  const year = period.start.getUTCFullYear() + (prevMonthIndex < 0 ? -1 : 0);
  const monthIndex = ((prevMonthIndex % 12) + 12) % 12;
  const monthStr = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
  return resolveReportPeriod(monthStr);
}

// ---------------------------------------------------------------------
// Month-over-month metric computation -- byte-identical logic to fuel's.
// ---------------------------------------------------------------------

export function computeMonthOverMonthMetric(
  label: string,
  unit: string,
  current: number | null,
  previous: number | null,
  possibleExplanation: Labeled<string>
): MonthOverMonthMetric {
  const currentLabeled: Labeled<number> =
    current === null
      ? { status: 'UNAVAILABLE', value: null, reason: 'No data recorded for this reporting period.' }
      : { status: 'FACT', value: current };

  const previousLabeled: Labeled<number> =
    previous === null
      ? { status: 'UNAVAILABLE', value: null, reason: 'No data recorded for the prior comparable period.' }
      : { status: 'FACT', value: previous };

  const bothAvailable = currentLabeled.value !== null && previousLabeled.value !== null;

  const delta: Labeled<number> = bothAvailable
    ? { status: 'CALCULATED', value: Math.round(((current as number) - (previous as number)) * 100) / 100 }
    : { status: 'UNAVAILABLE', value: null, reason: 'Cannot compute a change without both periods’ data.' };

  const deltaPercent: Labeled<number> = bothAvailable && (previous as number) !== 0
    ? {
        status: 'CALCULATED',
        value: Math.round((((current as number) - (previous as number)) / (previous as number)) * 1000) / 10,
      }
    : bothAvailable && (previous as number) === 0
      ? { status: 'UNAVAILABLE', value: null, reason: 'Prior period was zero; a percentage change is undefined.' }
      : { status: 'UNAVAILABLE', value: null, reason: 'Cannot compute a percentage change without both periods’ data.' };

  let direction: MonthOverMonthMetric['direction'] = 'unavailable';
  if (delta.status === 'CALCULATED' && delta.value !== null) {
    if (Math.abs(delta.value) < 1e-9) direction = 'flat';
    else direction = delta.value > 0 ? 'up' : 'down';
  }

  return {
    label,
    unit,
    current: currentLabeled,
    previous: previousLabeled,
    delta,
    deltaPercent,
    direction,
    possibleExplanation,
  };
}

// ---------------------------------------------------------------------
// Cost driver classification (HIGH vs ABNORMAL)
// ---------------------------------------------------------------------

export interface ExpenseCostDriverInput {
  license_plate: string;
  totalCost: number;
  transactionCount: number;
}

/**
 * Classifies each vehicle's current-period expense cost as high_cost,
 * abnormal_cost, or normal. Mirrors fuel's classifyCostDrivers exactly
 * (abnormal_cost takes display precedence over high_cost when a vehicle
 * qualifies as both), with `totalLitres` dropped -- expenses have no
 * volume dimension.
 */
export function classifyCostDrivers(
  current: ExpenseCostDriverInput[],
  previousCostByPlate: Map<string, number>,
  opts: {
    highCostTopPercent?: number;
    abnormalSpikeMultiplier?: number;
    abnormalMaterialityFloor?: number;
  } = {}
): ExpenseCostDriverRow[] {
  const highCostTopPercent = opts.highCostTopPercent ?? HIGH_COST_TOP_PERCENT;
  const spikeMultiplier = opts.abnormalSpikeMultiplier ?? ABNORMAL_COST_SPIKE_MULTIPLIER;
  const materialityFloor = opts.abnormalMaterialityFloor ?? ABNORMAL_COST_MATERIALITY_FLOOR;

  const totalFleetCost = current.reduce((sum, v) => sum + v.totalCost, 0);
  const sorted = [...current].sort((a, b) => b.totalCost - a.totalCost);
  const highCostCount = Math.max(1, Math.ceil(sorted.length * highCostTopPercent));
  const highCostPlates = new Set(sorted.slice(0, highCostCount).map((v) => v.license_plate));

  return current.map((v) => {
    const previous = previousCostByPlate.get(v.license_plate);
    let classification: ExpenseCostDriverRow['classification'] = 'normal';
    let abnormalReason: string | undefined;

    if (previous !== undefined && previous > 0) {
      const ratio = v.totalCost / previous;
      const absoluteIncrease = v.totalCost - previous;
      if (ratio >= spikeMultiplier && absoluteIncrease >= materialityFloor) {
        classification = 'abnormal_cost';
        abnormalReason = `Cost rose ${Math.round((ratio - 1) * 1000) / 10}% vs. the prior period (from ${previous.toFixed(2)} to ${v.totalCost.toFixed(2)}), exceeding the ${Math.round((spikeMultiplier - 1) * 100)}% / ${materialityFloor}-unit threshold.`;
      }
    }

    if (classification !== 'abnormal_cost' && highCostPlates.has(v.license_plate)) {
      classification = 'high_cost';
    }

    return {
      license_plate: v.license_plate,
      totalCost: { status: 'FACT', value: v.totalCost },
      transactionCount: { status: 'FACT', value: v.transactionCount },
      shareOfFleetCostPercent: totalFleetCost > 0
        ? { status: 'CALCULATED', value: Math.round((v.totalCost / totalFleetCost) * 1000) / 10 }
        : { status: 'UNAVAILABLE', value: null, reason: 'Fleet recorded no expense cost this period.' },
      classification,
      abnormalReason,
    };
  });
}

/** What share of total fleet expense cost the top N vehicles (by cost) account for. Identical logic to fuel's computeCostConcentration. */
export function computeCostConcentration(
  current: ExpenseCostDriverInput[],
  topN: number = 5
): Labeled<{ vehicleCount: number; costSharePercent: number }> {
  if (current.length === 0) {
    return { status: 'UNAVAILABLE', value: null, reason: 'No expenses recorded for this period.' };
  }
  const totalCost = current.reduce((sum, v) => sum + v.totalCost, 0);
  if (totalCost <= 0) {
    return { status: 'UNAVAILABLE', value: null, reason: 'Fleet recorded no expense cost this period.' };
  }
  const sorted = [...current].sort((a, b) => b.totalCost - a.totalCost);
  const n = Math.min(topN, sorted.length);
  const topCost = sorted.slice(0, n).reduce((sum, v) => sum + v.totalCost, 0);
  return {
    status: 'CALCULATED',
    value: { vehicleCount: n, costSharePercent: Math.round((topCost / totalCost) * 1000) / 10 },
  };
}

// ---------------------------------------------------------------------
// Data quality assessment
// ---------------------------------------------------------------------

export interface RawExpenseQualityInput {
  license_plate: string;
  date: string; // ISO
  amount: number;
  category?: string | null;
}

/**
 * Assesses field-completeness and suspected duplicate entries for the
 * raw expense transactions in a reporting period. Descriptive, not
 * accusatory -- same framing as fuel's assessDataQuality.
 *
 * Deliberately only two metrics, not three like fuel's: fuel checks
 * driver_id, fuel_type, AND odometer because all three each feed a
 * distinct section of that report (driver findings, fuel type mix, and
 * distance-based metrics respectively). This report has no driver
 * section and no distance-based section, so there is nothing for a
 * missing-driver or missing-odometer-equivalent check to actually bound
 * confidence in here -- adding one anyway would be exactly the kind of
 * invented, undisclosed-basis metric this reporting layer's own
 * threshold-documentation discipline argues against. Missing category
 * is kept because CategoryMixRow (this report's fuel-type-mix
 * equivalent) directly depends on it.
 */
export function assessDataQuality(
  transactions: RawExpenseQualityInput[],
  truncated: boolean
): DataQualitySection {
  const total = transactions.length;

  if (total === 0) {
    return {
      totalTransactionsInPeriod: 0,
      truncated,
      metrics: [],
      overallAssessment: 'insufficient_data',
    };
  }

  const missingCategory = transactions.filter((t) => !t.category).length;

  // Suspected duplicates: same vehicle, same calendar date, same amount
  // -- same conservative three-field signature approach as fuel's
  // (vehicle + date + volume + cost there; vehicle + date + amount here,
  // since expenses have no separate volume field to add as a fourth).
  const signatureCounts = new Map<string, number>();
  for (const t of transactions) {
    const key = `${t.license_plate}|${t.date.slice(0, 10)}|${t.amount}`;
    signatureCounts.set(key, (signatureCounts.get(key) ?? 0) + 1);
  }
  const suspectedDuplicateTransactions = Array.from(signatureCounts.values())
    .filter((count) => count > 1)
    .reduce((sum, count) => sum + count, 0);

  const pct = (n: number) => Math.round((n / total) * 1000) / 10;
  const severityFor = (percent: number): DataQualityMetric['severity'] =>
    percent > DATA_QUALITY_FAIR_MAX_ISSUE_PERCENT ? 'urgent' : percent > DATA_QUALITY_GOOD_MAX_ISSUE_PERCENT ? 'attention' : 'info';

  const metrics: DataQualityMetric[] = [
    {
      label: 'Expenses with no category recorded',
      affectedCount: missingCategory,
      totalCount: total,
      percent: pct(missingCategory),
      severity: severityFor(pct(missingCategory)),
      detail: 'These transactions are grouped as "Uncategorized" in the category mix.',
    },
    {
      label: 'Suspected duplicate entries (same vehicle, date and amount)',
      affectedCount: suspectedDuplicateTransactions,
      totalCount: total,
      percent: pct(suspectedDuplicateTransactions),
      severity: suspectedDuplicateTransactions > 0 ? 'attention' : 'info',
      detail: 'Matching signature on vehicle, calendar date and amount. Not conclusive proof of duplicate entry -- verify before correcting.',
    },
  ];

  const worst = Math.max(...metrics.map((m) => m.percent));
  const overallAssessment: DataQualitySection['overallAssessment'] =
    worst <= DATA_QUALITY_GOOD_MAX_ISSUE_PERCENT ? 'good' : worst <= DATA_QUALITY_FAIR_MAX_ISSUE_PERCENT ? 'fair' : 'poor';

  return {
    totalTransactionsInPeriod: total,
    truncated,
    metrics,
    overallAssessment,
  };
}

// ---------------------------------------------------------------------
// Allocation ledger reconciliation -- byte-identical logic to fuel's,
// messaging adapted to say "expense" instead of "fuel".
// ---------------------------------------------------------------------

export function reconcileAllocation(
  operationalTotal: number | null,
  ledgerTotal: number | null,
  materialityPercent: number = ALLOCATION_RECONCILIATION_MATERIALITY_PERCENT
): {
  operationalTotal: Labeled<number>;
  ledgerTotal: Labeled<number>;
  variance: Labeled<number>;
  variancePercent: Labeled<number>;
  reconciled: boolean | null;
  note: string;
} {
  const opLabeled: Labeled<number> =
    operationalTotal === null
      ? { status: 'UNAVAILABLE', value: null, reason: 'No expenses recorded for this period.' }
      : { status: 'FACT', value: operationalTotal };
  const ledgerLabeled: Labeled<number> =
    ledgerTotal === null
      ? { status: 'UNAVAILABLE', value: null, reason: 'No allocation ledger postings found for the expense cost category in this period.' }
      : { status: 'FACT', value: ledgerTotal };

  if (operationalTotal === null || ledgerTotal === null) {
    return {
      operationalTotal: opLabeled,
      ledgerTotal: ledgerLabeled,
      variance: { status: 'UNAVAILABLE', value: null, reason: 'Cannot reconcile without both totals.' },
      variancePercent: { status: 'UNAVAILABLE', value: null, reason: 'Cannot reconcile without both totals.' },
      reconciled: null,
      note: 'Reconciliation could not be performed -- one or both totals are unavailable for this period.',
    };
  }

  const variance = Math.round((operationalTotal - ledgerTotal) * 100) / 100;
  const variancePercent = ledgerTotal !== 0 ? Math.round((variance / ledgerTotal) * 1000) / 10 : (variance === 0 ? 0 : null);
  const reconciled = variancePercent !== null && Math.abs(variancePercent) <= materialityPercent;

  return {
    operationalTotal: opLabeled,
    ledgerTotal: ledgerLabeled,
    variance: { status: 'CALCULATED', value: variance },
    variancePercent:
      variancePercent === null
        ? { status: 'UNAVAILABLE', value: null, reason: 'Ledger total is zero; a percentage variance is undefined.' }
        : { status: 'CALCULATED', value: variancePercent },
    reconciled,
    note: reconciled
      ? `Operational expense records and the allocation ledger agree within ${materialityPercent}%.`
      : `Operational expense records (${operationalTotal.toFixed(2)}) and the allocation ledger expense total (${ledgerTotal.toFixed(2)}) differ by ${variance.toFixed(2)} (${variancePercent === null ? 'undefined %' : `${variancePercent}%`}), exceeding the ${materialityPercent}% reconciliation threshold. This does not by itself identify which side is wrong -- it identifies that the two do not currently agree and should be investigated before the figures are reported externally.`,
  };
}
