// frontend/modules/leaderboard/utils/leaderboard.utils.ts
//
// Pure functions only -- no React, no fetch, no imports from any module
// that reaches either. Kept separate from the components so the
// ranking/aggregation/formatting logic can be unit tested under
// tests/unit (Jest's plain 'node' environment; this repo wires up no
// jsdom or React Testing Library -- see tests/unit/drivers/
// driver-risk-utils.spec.ts and tests/unit/observability/
// provider-health.utils.spec.ts for the same convention).
//
// TWO RULES GOVERN EVERYTHING BELOW.
//
// 1. NEVER FABRICATE A ZERO. A source that did not answer produces
//    `null`, not 0. On a leaderboard the two are indistinguishable to
//    the reader and opposite in meaning: "no vehicle has open alerts"
//    versus "we could not find out". The same rule the value ledger is
//    built on (see modules/attention/types/value-ledger.types.ts).
//
// 2. NEVER MUTATE AN INPUT. Every function here takes response data the
//    caller may still hold a reference to -- a TanStack Query cache
//    entry is shared by every component reading that key, so sorting an
//    array in place would reorder somebody else's already-rendered
//    list. Every sort copies first.

import type { DriverRiskBatchResult } from '@/frontend/modules/ai/types/driver-risk.types';
import type {
  AiBatchItem,
  AiBatchResult,
  AiDashboardSummary,
  AiSeverity,
  DriverLeaderboardMetric,
  DriverLeaderboardRow,
  LeaderboardValueFormat,
  MostExpensiveVehicleRow,
  RankOrder,
  RankedRow,
  RepairFrequencyByVehicleRow,
  VehicleAlertLeaderboardRow,
} from '../types';
import { formatCurrency, formatNumber } from '@/shared/utils/currency.utils';

// ─── Numeric guards ────────────────────────────────────────────────────

/**
 * A finite number, or `fallback` for anything else.
 *
 * Every figure this module ranks arrives over the network from an
 * aggregation, and Mongo's `$sum` over a field that is absent on every
 * matched document yields null, which JSON carries through as `null`.
 * `null > 5` is false and `null - 5` is -5, so an unguarded null does
 * not throw -- it silently sorts to the bottom and renders as "0".
 * Coercing explicitly is the difference between a wrong leaderboard and
 * a visibly empty one.
 */
export function safeNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Sums `valueOf` across `rows`, skipping non-finite values rather than propagating NaN. */
export function sumBy<T>(rows: readonly T[], valueOf: (row: T) => unknown): number {
  return rows.reduce<number>((total, row) => total + safeNumber(valueOf(row), 0), 0);
}

// ─── Severity ──────────────────────────────────────────────────────────

/** Ranked least-severe first, so an index comparison orders two severities. */
const SEVERITY_ORDER: readonly AiSeverity[] = ['low', 'medium', 'high', 'critical'];

/**
 * The more serious of two severities. Mirrors maxSeverity() in
 * modules/telematics/services/reading-alerts.ts deliberately -- same
 * ordering, so a severity shown on a leaderboard means what it means on
 * the map. An unrecognized value ranks lowest rather than throwing, so
 * a severity the backend adds later cannot make a tile crash; it just
 * loses to any known severity until this union is widened.
 */
export function maxSeverity(a: AiSeverity, b: AiSeverity): AiSeverity {
  return SEVERITY_ORDER.indexOf(a) >= SEVERITY_ORDER.indexOf(b) ? a : b;
}

// ─── Batch counting ────────────────────────────────────────────────────

/** An AiBatchItem that actually carries a finding. */
type BatchFinding<T> = AiBatchItem<T> & { data: T };

/**
 * The findings in an AI batch: items that both succeeded AND carry
 * data.
 *
 * THIS IS THE ONLY CORRECT PREDICATE ACROSS THE THREE BATCHES, and
 * getting it wrong is not a cosmetic bug. `succeeded` counts findings
 * for predictiveMaintenance and fuelFraud (they push success=false when
 * there is nothing to report) but counts EVERY EXPENSE EXAMINED for
 * expenseAnomalies, which pushes `{ success: true, data: undefined }`
 * for a normal expense (see expense-anomaly-detection.service.ts's
 * detectAnomalies loop). A tile reading `succeeded` would show a fleet
 * with 4,000 clean expenses as having 4,000 expense anomalies.
 */
export function batchFindings<T>(batch: AiBatchResult<T> | null | undefined): BatchFinding<T>[] {
  if (!batch || !Array.isArray(batch.results)) return [];
  return batch.results.filter((item): item is BatchFinding<T> => item.success && item.data !== undefined);
}

/**
 * How many findings an AI batch holds, or `null` when the batch is
 * absent.
 *
 * A null batch means the service failed and getAIDashboard() mapped it
 * to null -- NOT that the count is zero. Returning 0 there would report
 * "no fuel fraud in your fleet" on the strength of a request that never
 * completed.
 */
export function countBatchFindings<T>(batch: AiBatchResult<T> | null | undefined): number | null {
  if (!batch) return null;
  return batchFindings(batch).length;
}

// ─── Ranking ───────────────────────────────────────────────────────────

export interface RankOptions {
  /** Keep at most this many rows AFTER ranking. Omit for all rows. */
  limit?: number;
  /** 'desc' (default) puts the largest value at rank 1. */
  order?: RankOrder;
  /** Drop rows whose value is 0 before ranking. Default false. */
  omitZeroValues?: boolean;
}

interface RankInput<T> {
  id: string;
  label: string;
  value: number;
  source: T;
}

/**
 * Ranks rows into a leaderboard.
 *
 * TIE HANDLING is standard competition ranking (1, 2, 2, 4): tied rows
 * share the better rank and the next distinct value skips the ranks the
 * tie consumed. Dense ranking (1, 2, 2, 3) would place a vehicle at
 * "number 3" with three vehicles ahead of it. Tied rows are also
 * flagged, so the UI can say so rather than implying the order between
 * them is meaningful.
 *
 * ORDER STABILITY: ties break on `label` (case-insensitive, then
 * codepoint) rather than being left to the input order. Array#sort is
 * specified as stable, but the INPUT order here is a Mongo aggregation
 * whose order among equal sort keys is not guaranteed, so without an
 * explicit tie-break two identical fleets could render in different
 * orders on consecutive polls, which reads as flicker.
 */
export function rankRows<T>(rows: readonly RankInput<T>[], options: RankOptions = {}): RankedRow<T>[] {
  const { limit, order = 'desc', omitZeroValues = false } = options;

  const cleaned = rows
    .map((row) => ({ ...row, value: safeNumber(row.value, 0) }))
    .filter((row) => (omitZeroValues ? row.value !== 0 : true));

  const sorted = [...cleaned].sort((a, b) => {
    const delta = order === 'desc' ? b.value - a.value : a.value - b.value;
    if (delta !== 0) return delta;
    return compareLabels(a.label, b.label);
  });

  const valueCounts = new Map<number, number>();
  for (const row of sorted) {
    valueCounts.set(row.value, (valueCounts.get(row.value) ?? 0) + 1);
  }

  const ranked: RankedRow<T>[] = [];
  let previousValue: number | null = null;
  let previousRank = 0;

  sorted.forEach((row, index) => {
    // Standard competition ranking: a new distinct value takes the
    // 1-based position it actually occupies; an equal value repeats the
    // rank already assigned.
    const rank = previousValue !== null && row.value === previousValue ? previousRank : index + 1;
    previousValue = row.value;
    previousRank = rank;

    ranked.push({
      rank,
      id: row.id,
      label: row.label,
      value: row.value,
      tied: (valueCounts.get(row.value) ?? 0) > 1,
      source: row.source,
    });
  });

  return typeof limit === 'number' && limit >= 0 ? ranked.slice(0, limit) : ranked;
}

/**
 * Deterministic label ordering for tie-breaks. Case-insensitive first
 * (so 'ab-123' and 'AB-123' don't straddle every uppercase plate), then
 * a raw comparison so two labels differing only in case still get a
 * stable, total order rather than comparing equal.
 */
export function compareLabels(a: string, b: string): number {
  const lowerA = a.toLowerCase();
  const lowerB = b.toLowerCase();
  if (lowerA < lowerB) return -1;
  if (lowerA > lowerB) return 1;
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

// ─── Driver leaderboard ────────────────────────────────────────────────

/**
 * Flattens GET /api/ai/driver-risk's batch (or the `driverRisk` panel
 * of GET /api/ai/dashboard) into leaderboard rows.
 *
 * Drops items that failed or carry no data: a driver the model could
 * not score is not a driver with a score of zero, and a zero on a risk
 * leaderboard reads as "exemplary". `driverId` falls back to the
 * batch item's `entityId`, which is the same OrganizationMember.userId
 * (see DriverRiskScore.driverId) -- the fallback only matters if a
 * future service omits the field on the payload while still keying the
 * batch by it.
 */
export function toDriverLeaderboardRows(
  batch: DriverRiskBatchResult | null | undefined
): DriverLeaderboardRow[] {
  if (!batch || !Array.isArray(batch.results)) return [];

  const rows: DriverLeaderboardRow[] = [];

  for (const item of batch.results) {
    if (!item.success || !item.data) continue;
    const score = item.data;
    const speedingEvents = safeNumber(score.metrics?.speedingEvents, 0);
    const hardBrakes = safeNumber(score.metrics?.hardBrakes, 0);
    const hardAccelerations = safeNumber(score.metrics?.hardAccelerations, 0);

    rows.push({
      driverId: score.driverId || item.entityId,
      driverName: score.driverName || 'Unnamed driver',
      riskScore: safeNumber(score.overallScore, 0),
      riskLevel: score.riskLevel,
      speedingEvents,
      hardBrakes,
      hardAccelerations,
      alertEvents: speedingEvents + hardBrakes + hardAccelerations,
    });
  }

  return rows;
}

/** The figure a given driver metric ranks on. */
export function driverMetricValue(row: DriverLeaderboardRow, metric: DriverLeaderboardMetric): number {
  return metric === 'risk-score' ? row.riskScore : row.alertEvents;
}

/**
 * Ranks drivers worst-first for the chosen metric.
 *
 * Both metrics rank DESCENDING, and both are "worse when higher":
 * DriverRiskScore.overallScore is explicitly documented as
 * lower = safer, and an event count is obviously worse when larger. The
 * inverted one on this payload is `metrics.safetyScore` (higher =
 * safer), which is why it is deliberately not a leaderboard metric --
 * ranking it descending would put the safest driver at the top of a
 * board captioned "needs attention".
 */
export function buildDriverLeaderboard(
  batch: DriverRiskBatchResult | null | undefined,
  metric: DriverLeaderboardMetric,
  limit = 10
): RankedRow<DriverLeaderboardRow>[] {
  const rows = toDriverLeaderboardRows(batch);
  return rankRows(
    rows.map((row) => ({
      id: row.driverId,
      label: row.driverName,
      value: driverMetricValue(row, metric),
      source: row,
    })),
    { limit, order: 'desc' }
  );
}

// ─── Vehicle leaderboard ───────────────────────────────────────────────

/**
 * Aggregates the two vehicle-attributable AI batches into per-vehicle
 * alert counts.
 *
 * ONLY TWO SOURCES ARE VEHICLE-ATTRIBUTABLE on this payload:
 * predictiveMaintenance (vehicleId + licensePlate) and fuelFraud
 * (vehicleId + licensePlate). expenseAnomalies is excluded because its
 * `entityId` is the EXPENSE record's `_id` and the alert carries no
 * plate at all -- see the doc comment on ExpenseAnomalyAlert. Including
 * it by treating `entityId` as a vehicle id would produce a leaderboard
 * of vehicles that do not exist.
 *
 * fleetHealth.vehicleScores is also excluded: a health score is not an
 * alert count, and summing a 0-100 score into a count of findings would
 * make one unhealthy vehicle outrank a hundred real alerts.
 *
 * Keyed on vehicleId, never licensePlate -- see
 * VehicleAlertLeaderboardRow.
 */
export function buildVehicleAlertRows(
  summary: AiDashboardSummary | null | undefined
): VehicleAlertLeaderboardRow[] {
  if (!summary) return [];

  const byVehicle = new Map<string, VehicleAlertLeaderboardRow>();

  const ensureRow = (vehicleId: string, licensePlate: string): VehicleAlertLeaderboardRow => {
    const existing = byVehicle.get(vehicleId);
    if (existing) {
      // Keep the first non-empty plate seen. Two batches disagreeing on
      // a plate for one vehicleId means the vehicle was re-plated
      // between the reads; neither is "wrong", so the first is kept
      // rather than silently flip-flopping between renders.
      if (!existing.licensePlate && licensePlate) existing.licensePlate = licensePlate;
      return existing;
    }
    const created: VehicleAlertLeaderboardRow = {
      vehicleId,
      licensePlate,
      predictiveMaintenanceCount: 0,
      fuelFraudCount: 0,
      totalAlerts: 0,
      worstSeverity: 'low',
      estimatedCost: 0,
    };
    byVehicle.set(vehicleId, created);
    return created;
  };

  for (const item of batchFindings(summary.predictiveMaintenance)) {
    const prediction = item.data;
    const vehicleId = prediction.vehicleId || item.entityId;
    if (!vehicleId) continue;
    const row = ensureRow(vehicleId, prediction.licensePlate ?? '');
    row.predictiveMaintenanceCount += 1;
    row.totalAlerts += 1;
    row.worstSeverity = maxSeverity(row.worstSeverity, prediction.severity);
    row.estimatedCost += safeNumber(prediction.estimatedCost, 0);
  }

  for (const item of batchFindings(summary.fuelFraud)) {
    const alert = item.data;
    const vehicleId = alert.vehicleId || item.entityId;
    if (!vehicleId) continue;
    const row = ensureRow(vehicleId, alert.licensePlate ?? '');
    row.fuelFraudCount += 1;
    row.totalAlerts += 1;
    row.worstSeverity = maxSeverity(row.worstSeverity, alert.severity);
  }

  return Array.from(byVehicle.values());
}

/** Ranks vehicles by open AI findings, worst first. */
export function buildVehicleAlertLeaderboard(
  summary: AiDashboardSummary | null | undefined,
  limit = 10
): RankedRow<VehicleAlertLeaderboardRow>[] {
  return rankRows(
    buildVehicleAlertRows(summary).map((row) => ({
      id: row.vehicleId,
      // A vehicle with no plate on either finding still needs a label a
      // reader can act on; the id is at least resolvable.
      label: row.licensePlate || row.vehicleId,
      value: row.totalAlerts,
      source: row,
    })),
    { limit, order: 'desc' }
  );
}

/**
 * Ranks the server-side "most expensive vehicles" aggregation.
 *
 * The rows arrive already sorted by totalCost descending, so this does
 * not re-sort for correctness -- it re-ranks so ties are detected and
 * numbered the same way every other board on this page numbers them,
 * and so `limit` is applied consistently. Re-ranking an already-sorted
 * list is a no-op on order.
 */
export function buildMaintenanceCostLeaderboard(
  rows: readonly MostExpensiveVehicleRow[] | null | undefined,
  limit = 10
): RankedRow<MostExpensiveVehicleRow>[] {
  if (!rows) return [];
  return rankRows(
    rows.map((row) => ({
      id: row.license_plate,
      label: row.license_plate,
      value: safeNumber(row.totalCost, 0),
      source: row,
    })),
    { limit, order: 'desc' }
  );
}

/** Ranks the server-side "repair frequency by vehicle" aggregation. */
export function buildRepairCountLeaderboard(
  rows: readonly RepairFrequencyByVehicleRow[] | null | undefined,
  limit = 10
): RankedRow<RepairFrequencyByVehicleRow>[] {
  if (!rows) return [];
  return rankRows(
    rows.map((row) => ({
      id: row.license_plate,
      label: row.license_plate,
      value: safeNumber(row.count, 0),
      source: row,
    })),
    { limit, order: 'desc' }
  );
}

// ─── Formatting ────────────────────────────────────────────────────────

/** Em dash: the single "no value" glyph used across this module. */
export const NO_VALUE = '—';

/**
 * Formats a leaderboard value for display.
 *
 * `null`/`undefined`/NaN render as an em dash, never as "0" -- see the
 * never-fabricate-a-zero rule at the top of this file. A real 0 renders
 * as "0".
 */
export function formatLeaderboardValue(
  value: number | null | undefined,
  format: LeaderboardValueFormat
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return NO_VALUE;
  }

  switch (format) {
    case 'currency':
      return formatCurrency(value);
    case 'score':
      // Presentation clamp only, matching formatRiskScore() in the ai
      // module: the backend's weighted sums can land marginally outside
      // 0-100, and a gauge captioned "103 / 100" reads as a bug.
      return String(Math.round(Math.max(0, Math.min(100, value))));
    case 'count':
    default:
      return formatNumber(Math.round(value));
  }
}

/** "#1", "#2" ... with a tie marker, e.g. "#2 (tied)". */
export function formatRankLabel(row: Pick<RankedRow<unknown>, 'rank' | 'tied'>): string {
  return row.tied ? `#${row.rank} (tied)` : `#${row.rank}`;
}

/**
 * Shortens a label for a fixed-width chart axis, keeping the START of
 * the string.
 *
 * Plates and driver names are distinguished by their leading
 * characters, so truncating the tail keeps the discriminating part;
 * an ellipsis marks that something was cut, so nobody reads a truncated
 * plate as the whole plate. Returns the input unchanged when it fits,
 * and never returns a string longer than `maxLength`.
 */
export function truncateLabel(label: string, maxLength = 14): string {
  if (maxLength <= 0) return '';
  if (label.length <= maxLength) return label;
  if (maxLength === 1) return '…';
  return `${label.slice(0, maxLength - 1)}…`;
}

/**
 * Percentage share of a total, or null when the total is 0 or the value
 * is unusable.
 *
 * Null rather than 0 for a zero total: "0% of nothing" is not a fact
 * about this vehicle, and a bar rendered at 0% implies it was measured.
 */
export function shareOfTotal(value: number, total: number): number | null {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total === 0) return null;
  return (value / total) * 100;
}
