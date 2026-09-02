// frontend/modules/leaderboard/types/leaderboard.types.ts
//
// View-model types for the Fleet Leaderboard and Alert Category Tiles.
// These are shapes this module BUILDS from API responses, not shapes
// the API returns -- the wire shapes live in ./ai-dashboard.types.ts
// and ./index.ts's re-exports of the shared maintenance rows.

import type { AiSeverity } from './ai-dashboard.types';

// ─── Ranking primitives ────────────────────────────────────────────────

/** Sort direction for a ranked list. */
export type RankOrder = 'desc' | 'asc';

/**
 * How a leaderboard value should be rendered. Chosen by the metric, not
 * guessed from the number: 12 repairs and $12 are the same primitive.
 */
export type LeaderboardValueFormat = 'count' | 'currency' | 'score';

/**
 * One ranked row. `rank` is 1-based STANDARD COMPETITION RANKING: tied
 * rows share the lower rank and the next distinct value skips
 * accordingly (1, 2, 2, 4). Dense ranking (1, 2, 2, 3) would tell a
 * fleet manager that the third-worst vehicle is "number 3" when two
 * vehicles are ahead of it, which misstates the position.
 */
export interface RankedRow<T> {
  rank: number;
  /** Stable identity for React keys and click-through. */
  id: string;
  /** Human label shown on the chart axis and in the table. */
  label: string;
  value: number;
  /** True when this row shares its value (and therefore its rank) with another. */
  tied: boolean;
  /** The row this was ranked from, for tooltips and drill-through. */
  source: T;
}

// ─── Driver leaderboard ────────────────────────────────────────────────

/**
 * What the driver leaderboard ranks on.
 *
 *   risk-score   DriverRiskScore.overallScore (0-100, HIGHER = riskier).
 *   alert-events Sum of the three telematics event counters the risk
 *                model itself counted: speedingEvents + hardBrakes +
 *                hardAccelerations. Deliberately excludes idlingTime
 *                (hours, not events) and nightDrivingHours (hours, and
 *                not an alert) -- adding a duration to an event count
 *                produces a number that means nothing.
 */
export type DriverLeaderboardMetric = 'risk-score' | 'alert-events';

export interface DriverLeaderboardRow {
  /** OrganizationMember.userId -- the id GET /api/ai/driver-risk round-trips. */
  driverId: string;
  driverName: string;
  /** 0-100, higher = riskier. */
  riskScore: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  speedingEvents: number;
  hardBrakes: number;
  hardAccelerations: number;
  /** speedingEvents + hardBrakes + hardAccelerations. */
  alertEvents: number;
}

// ─── Vehicle leaderboard ───────────────────────────────────────────────

/**
 * What the vehicle leaderboard ranks on. Each metric is backed by a
 * DIFFERENT endpoint, so switching metric switches data source -- see
 * ../hooks/useFleetLeaderboard.ts.
 *
 *   maintenance-cost  GET /api/reminders?action=most-expensive-vehicles
 *                     (server-ranked, org-unit scoped, completed records only).
 *   repair-count      GET /api/reminders?action=repair-frequency (same).
 *   open-alerts       Derived client-side from GET /api/ai/dashboard's
 *                     predictiveMaintenance + fuelFraud batches, which are
 *                     the two AI sources carrying a real vehicleId.
 */
export type VehicleLeaderboardMetric = 'maintenance-cost' | 'repair-count' | 'open-alerts';

/**
 * A vehicle ranked by open AI findings.
 *
 * KEYED BY vehicleId, NOT licensePlate. Both AI batches carry the
 * vehicle's `_id`, and a plate is mutable and re-assignable, so joining
 * on it would merge two vehicles that happened to share a plate across
 * a re-registration. `licensePlate` is carried for display only.
 */
export interface VehicleAlertLeaderboardRow {
  vehicleId: string;
  licensePlate: string;
  predictiveMaintenanceCount: number;
  fuelFraudCount: number;
  /** predictiveMaintenanceCount + fuelFraudCount. */
  totalAlerts: number;
  /** Worst severity across the findings counted above. */
  worstSeverity: AiSeverity;
  /** Summed PredictiveMaintenancePrediction.estimatedCost. 0 when no prediction carried a cost. */
  estimatedCost: number;
}

// ─── Alert category tiles ──────────────────────────────────────────────

/** The seven categories the tiles cover. */
export type AlertCategoryId =
  | 'overspeed'
  | 'harsh_braking'
  | 'geofence'
  | 'low_fuel'
  | 'maintenance_due'
  | 'fuel_fraud'
  | 'expense_anomaly';

/**
 * Whether a category can be counted from an endpoint that exists today.
 *
 *   supported    A real, fleet-wide figure is available.
 *   unsupported  No aggregation endpoint exists. The tile renders
 *                disabled with the required contract named -- it does
 *                NOT render 0. A zero and an unanswerable question look
 *                identical on a tile, and the difference is the whole
 *                point of the tile.
 */
export type AlertCategoryAvailability = 'supported' | 'unsupported';

/** Why a supported tile has no number right now. */
export type AlertCategoryState = 'ready' | 'loading' | 'error' | 'unsupported';

export interface AlertCategoryDefinition {
  id: AlertCategoryId;
  label: string;
  /** One line explaining what the number counts. Shown under the value. */
  description: string;
  availability: AlertCategoryAvailability;
  /** Provenance, e.g. 'GET /api/ai/dashboard -> driverRisk[].metrics.speedingEvents'. */
  sourceLabel: string;
  /** Only set when availability is 'unsupported': the contract that would fill this tile. */
  missingEndpoint?: string;
  /** Where clicking the tile leads, when a page exists that shows the underlying items. */
  href?: string;
  /** Rendering hint for the value. */
  format: LeaderboardValueFormat;
}

export interface AlertCategoryTileModel extends AlertCategoryDefinition {
  /**
   * The figure, or null when there isn't one. NEVER 0 as a stand-in for
   * unknown: null renders as an em dash with the reason, 0 renders as a
   * genuine "none found".
   */
  count: number | null;
  state: AlertCategoryState;
  /** Human-readable reason shown when `count` is null. */
  unavailableReason?: string;
}

/**
 * Everything buildAlertCategoryTiles() needs, passed explicitly rather
 * than read from hooks, so the builder stays a pure function that can
 * be unit tested without React.
 */
export interface AlertCategoryInputs {
  /** null while loading or on error -- see aiStatus for which. */
  driverRisk: {
    speedingEvents: number;
    hardBrakes: number;
  } | null;
  /** Count of open fuel-fraud findings, or null. */
  fuelFraudCount: number | null;
  /** Count of open expense-anomaly findings, or null. */
  expenseAnomalyCount: number | null;
  /** Unresolved reminders already past their due date, or null. */
  maintenanceOverdue: number | null;
  /** Unresolved reminders due in the future. Rendered as context, not as the tile's own figure. */
  maintenanceScheduled: number | null;
  /** Whether the AI dashboard query is still in flight / errored. */
  aiStatus: 'loading' | 'error' | 'ready';
  /** Whether the maintenance stats query is still in flight / errored. */
  maintenanceStatus: 'loading' | 'error' | 'ready';
}
