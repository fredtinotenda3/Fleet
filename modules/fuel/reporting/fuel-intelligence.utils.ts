// modules/fuel/reporting/fuel-intelligence.utils.ts
//
// Pure, DB-free calculation functions behind the Monthly Fuel & Fleet
// Intelligence Report (monthly-fuel-intelligence.service.ts). Extracted
// as plain functions specifically so the report's actual decision logic
// -- period resolution, HIGH vs ABNORMAL cost classification, data
// quality scoring, allocation reconciliation -- is unit-testable without
// mocking MongoDB, matching this codebase's established pattern (see
// modules/fuel/utils/fuel-type.utils.ts, modules/transport-cost/utils/
// operation-data-quality.utils.ts).
//
// PART 7-F ("distinguish HIGH COST from ABNORMAL COST -- not necessarily
// the same"): HIGH COST is a RANKING (this vehicle currently spends a
// lot relative to the rest of the fleet -- which may be entirely
// legitimate, e.g. a long-haul truck). ABNORMAL COST is a CHANGE (this
// vehicle's spend moved sharply against its OWN recent baseline,
// regardless of whether the resulting number is large or small in
// absolute terms). A vehicle can be one, both, or neither.
//
// PART 7-G ("don't invent thresholds without documenting basis, make
// them configurable"): every threshold below is a named exported
// constant with a comment explaining why that specific number, and every
// function accepts it as an optional parameter rather than hard-coding
// it inline.

import type {
  CostDriverRow,
  DataQualityMetric,
  DataQualitySection,
  Labeled,
  MonthOverMonthMetric,
  ReportPeriod,
} from './fuel-intelligence.types';

// ---------------------------------------------------------------------
// Thresholds -- documented, configurable, never silently hard-coded.
// ---------------------------------------------------------------------

/**
 * A vehicle is "high cost" if it falls within the top X% of vehicles by
 * total fuel cost this period. 20% chosen to match the familiar
 * Pareto-style "top fifth drives the bulk of cost" framing directors
 * already use informally -- NOT a statistically derived cutoff (there is
 * no historical incident dataset in this platform to derive one from).
 * Always at least 1 vehicle is included so a fleet of any size has SOME
 * answer to "which vehicle is the biggest cost driver".
 */
export const HIGH_COST_TOP_PERCENT = 0.2;

/**
 * A vehicle's cost is "abnormal" (month-over-month) if it increased by
 * at least this multiple AND by at least ABNORMAL_COST_MATERIALITY_FLOOR
 * in absolute terms versus its own previous-period cost. 1.5x (a 50%
 * increase) mirrors this platform's existing
 * DEFAULT_ABNORMAL_CONSUMPTION_MULTIPLIER-style convention
 * (modules/fuel/repositories/fuel.repository.ts flags a single fill-up
 * at 2x a vehicle's own average volume); 1.5x is used here rather than
 * 2x because month-over-month TOTAL cost naturally has lower variance
 * than a single fill-up's volume, so a smaller multiple is still a
 * genuine outlier at this level of aggregation.
 */
export const ABNORMAL_COST_SPIKE_MULTIPLIER = 1.5;

/**
 * The materiality floor exists so a vehicle going from $2 to $4 (a
 * "100% increase") is never reported as an abnormal cost event --
 * technically true, operationally noise. Currency-unit-agnostic; the
 * platform does not attempt cross-currency normalization elsewhere in
 * the fuel module, so this is applied in whatever the fleet's own
 * reporting currency is.
 */
export const ABNORMAL_COST_MATERIALITY_FLOOR = 50;

/** A ledger vs. operational total variance below this is treated as reconciled (rounding/timing noise, not a data-quality issue worth flagging to a director). */
export const ALLOCATION_RECONCILIATION_MATERIALITY_PERCENT = 1;

/** Data-quality field-completeness thresholds for the overall assessment rollup. */
export const DATA_QUALITY_GOOD_MAX_ISSUE_PERCENT = 5;
export const DATA_QUALITY_FAIR_MAX_ISSUE_PERCENT = 20;

// ---------------------------------------------------------------------
// Period resolution
// ---------------------------------------------------------------------

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * Resolves a 'YYYY-MM' string to a calendar-month UTC window
 * [start of month 00:00:00.000, end of month 23:59:59.999]. UTC (not
 * local time) so the report's boundaries never shift based on which
 * server or browser timezone happened to render it -- the same
 * discipline modules/finance/repositories/allocation-ledger.repository.ts
 * documents for its own "fully contained" period rule.
 */
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

/** The previous calendar month's period, for month-over-month comparison. Always resolvable -- there is no "no previous calendar month" case. */
export function resolvePreviousPeriod(period: ReportPeriod): ReportPeriod {
  const prevMonthIndex = period.start.getUTCMonth() - 1;
  const year = period.start.getUTCFullYear() + (prevMonthIndex < 0 ? -1 : 0);
  const monthIndex = ((prevMonthIndex % 12) + 12) % 12;
  const monthStr = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
  return resolveReportPeriod(monthStr);
}

// ---------------------------------------------------------------------
// Month-over-month metric computation
// ---------------------------------------------------------------------

/**
 * Builds one MonthOverMonthMetric. `current`/`previous` are `null` when
 * genuinely UNAVAILABLE for that period (never 0-as-placeholder -- the
 * caller is responsible for that distinction before calling this). This
 * function deliberately does NOT try to distinguish "no prior period
 * exists at all" from "the prior period exists but recorded no data" --
 * doing so honestly would require an extra query (does ANY data exist
 * before the prior period's start) that callers do not currently run;
 * rather than guess, both cases are reported identically as "no data
 * recorded for the prior comparable period."
 * `possibleExplanation` must already be a Labeled<string> the caller
 * built from ANOTHER metric in the same report (e.g. "average cost per
 * litre rose 12%, see Fleet Position") -- this function never invents
 * one; passing `unavailable(...)` is the correct default.
 */
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
// Cost driver classification (HIGH vs ABNORMAL, PART 7-F)
// ---------------------------------------------------------------------

export interface CostDriverInput {
  license_plate: string;
  totalCost: number;
  totalLitres: number;
  logCount: number;
}

/**
 * Classifies each vehicle's current-period cost as high_cost,
 * abnormal_cost, or normal. A vehicle can only carry ONE classification
 * in the returned row (abnormal_cost takes precedence in display terms
 * when a vehicle qualifies as both, since a sudden change is the more
 * actionable signal than a ranking) -- but the underlying HIGH_COST
 * ranking is still computed for every row via
 * `shareOfFleetCostPercent`, so a reader can see both dimensions.
 */
export function classifyCostDrivers(
  current: CostDriverInput[],
  previousCostByPlate: Map<string, number>,
  opts: {
    highCostTopPercent?: number;
    abnormalSpikeMultiplier?: number;
    abnormalMaterialityFloor?: number;
  } = {}
): CostDriverRow[] {
  const highCostTopPercent = opts.highCostTopPercent ?? HIGH_COST_TOP_PERCENT;
  const spikeMultiplier = opts.abnormalSpikeMultiplier ?? ABNORMAL_COST_SPIKE_MULTIPLIER;
  const materialityFloor = opts.abnormalMaterialityFloor ?? ABNORMAL_COST_MATERIALITY_FLOOR;

  const totalFleetCost = current.reduce((sum, v) => sum + v.totalCost, 0);
  const sorted = [...current].sort((a, b) => b.totalCost - a.totalCost);
  const highCostCount = Math.max(1, Math.ceil(sorted.length * highCostTopPercent));
  const highCostPlates = new Set(sorted.slice(0, highCostCount).map((v) => v.license_plate));

  return current.map((v) => {
    const previous = previousCostByPlate.get(v.license_plate);
    let classification: CostDriverRow['classification'] = 'normal';
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
      totalLitres: { status: 'FACT', value: v.totalLitres },
      logCount: { status: 'FACT', value: v.logCount },
      shareOfFleetCostPercent: totalFleetCost > 0
        ? { status: 'CALCULATED', value: Math.round((v.totalCost / totalFleetCost) * 1000) / 10 }
        : { status: 'UNAVAILABLE', value: null, reason: 'Fleet recorded no fuel cost this period.' },
      classification,
      abnormalReason,
    };
  });
}

/** What share of total fleet fuel cost the top N vehicles (by cost) account for -- the concentration figure that answers "how dependent is our fuel spend on a handful of vehicles". */
export function computeCostConcentration(
  current: CostDriverInput[],
  topN: number = 5
): Labeled<{ vehicleCount: number; costSharePercent: number }> {
  if (current.length === 0) {
    return { status: 'UNAVAILABLE', value: null, reason: 'No fuel logs recorded for this period.' };
  }
  const totalCost = current.reduce((sum, v) => sum + v.totalCost, 0);
  if (totalCost <= 0) {
    return { status: 'UNAVAILABLE', value: null, reason: 'Fleet recorded no fuel cost this period.' };
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
// Data quality assessment (PART 7-H)
// ---------------------------------------------------------------------

export interface RawFuelLogQualityInput {
  license_plate: string;
  date: string; // ISO
  fuel_volume: number;
  cost: number;
  driver_id?: string | null;
  fuel_type?: string | null;
  odometer?: number | null;
}

/**
 * Assesses field-completeness and suspected duplicate entries for the
 * raw fuel logs in a reporting period. This is descriptive, not
 * accusatory: a missing driver_id is not itself wrong (unattributed
 * fuel is a legitimate, already-supported state -- see
 * getFuelByDriver's "Unassigned" bucket), but a director benefits from
 * knowing HOW MUCH of the period's data carries each gap, since it
 * bounds how much confidence to place in driver- or vehicle-level
 * findings built from the same data.
 */
export function assessDataQuality(
  logs: RawFuelLogQualityInput[],
  truncated: boolean
): DataQualitySection {
  const total = logs.length;

  if (total === 0) {
    return {
      totalLogsInPeriod: 0,
      truncated,
      metrics: [],
      overallAssessment: 'insufficient_data',
    };
  }

  const missingDriver = logs.filter((l) => !l.driver_id).length;
  const missingFuelType = logs.filter((l) => !l.fuel_type).length;
  const missingOdometer = logs.filter((l) => l.odometer === undefined || l.odometer === null).length;

  // Suspected duplicates: same vehicle, same calendar date, same volume
  // AND same cost -- a conservative signature (all four must match) so
  // this flags genuine double-entry risk rather than two legitimately
  // similar fill-ups on the same day (e.g. a driver topping up twice).
  const signatureCounts = new Map<string, number>();
  for (const l of logs) {
    const key = `${l.license_plate}|${l.date.slice(0, 10)}|${l.fuel_volume}|${l.cost}`;
    signatureCounts.set(key, (signatureCounts.get(key) ?? 0) + 1);
  }
  const suspectedDuplicateLogs = Array.from(signatureCounts.values())
    .filter((count) => count > 1)
    .reduce((sum, count) => sum + count, 0);

  const pct = (n: number) => Math.round((n / total) * 1000) / 10;
  const severityFor = (percent: number): DataQualityMetric['severity'] =>
    percent > DATA_QUALITY_FAIR_MAX_ISSUE_PERCENT ? 'urgent' : percent > DATA_QUALITY_GOOD_MAX_ISSUE_PERCENT ? 'attention' : 'info';

  const metrics: DataQualityMetric[] = [
    {
      label: 'Fuel logs with no driver recorded',
      affectedCount: missingDriver,
      totalCount: total,
      percent: pct(missingDriver),
      severity: severityFor(pct(missingDriver)),
      detail: 'These logs cannot contribute to driver-level fuel cost findings; they are included in fleet and vehicle totals.',
    },
    {
      label: 'Fuel logs with no fuel type recorded',
      affectedCount: missingFuelType,
      totalCount: total,
      percent: pct(missingFuelType),
      severity: severityFor(pct(missingFuelType)),
      detail: 'These logs are grouped as "Unspecified" in the fuel type mix.',
    },
    {
      label: 'Fuel logs with no odometer reading',
      affectedCount: missingOdometer,
      totalCount: total,
      percent: pct(missingOdometer),
      severity: severityFor(pct(missingOdometer)),
      detail: 'Distance-based metrics (e.g. cost per km, consumption in km/L) cannot be computed for these logs.',
    },
    {
      label: 'Suspected duplicate entries (same vehicle, date, volume and cost)',
      affectedCount: suspectedDuplicateLogs,
      totalCount: total,
      percent: pct(suspectedDuplicateLogs),
      severity: suspectedDuplicateLogs > 0 ? 'attention' : 'info',
      detail: 'Matching signature on vehicle, calendar date, volume and cost. Not conclusive proof of duplicate entry -- verify before correcting.',
    },
  ];

  const worst = Math.max(...metrics.map((m) => m.percent));
  const overallAssessment: DataQualitySection['overallAssessment'] =
    worst <= DATA_QUALITY_GOOD_MAX_ISSUE_PERCENT ? 'good' : worst <= DATA_QUALITY_FAIR_MAX_ISSUE_PERCENT ? 'fair' : 'poor';

  return {
    totalLogsInPeriod: total,
    truncated,
    metrics,
    overallAssessment,
  };
}

// ---------------------------------------------------------------------
// Allocation ledger reconciliation (PART 7-I)
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
      ? { status: 'UNAVAILABLE', value: null, reason: 'No fuel logs recorded for this period.' }
      : { status: 'FACT', value: operationalTotal };
  const ledgerLabeled: Labeled<number> =
    ledgerTotal === null
      ? { status: 'UNAVAILABLE', value: null, reason: 'No allocation ledger postings found for the fuel cost category in this period.' }
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
      ? `Operational fuel records and the allocation ledger agree within ${materialityPercent}%.`
      : `Operational fuel records (${operationalTotal.toFixed(2)}) and the allocation ledger fuel total (${ledgerTotal.toFixed(2)}) differ by ${variance.toFixed(2)} (${variancePercent === null ? 'undefined %' : `${variancePercent}%`}), exceeding the ${materialityPercent}% reconciliation threshold. This does not by itself identify which side is wrong -- it identifies that the two do not currently agree and should be investigated before the figures are reported externally.`,
  };
}
