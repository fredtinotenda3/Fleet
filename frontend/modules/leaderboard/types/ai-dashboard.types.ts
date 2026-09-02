// frontend/modules/leaderboard/types/ai-dashboard.types.ts
//
// Wire shapes for GET /api/ai/dashboard (app/api/ai/dashboard/route.ts ->
// aiController.getAIDashboard), mirrored field-for-field from
// modules/ai/types/ai.types.ts.
//
// WHY A LOCAL COPY. modules/ai/types/*.ts lives under modules/ (the
// server-only tree) and frontend modules do not import server-tree
// files -- the same convention frontend/modules/ai/types/
// driver-risk.types.ts, observability/types/index.ts and
// workflows/types/index.ts already follow, each with its own copy.
//
// DATE HANDLING: every `Date` on the backend types crosses the wire as
// an ISO 8601 string (Date.toJSON() via NextResponse.json()); apiClient
// does not revive dates. Every date-like field below is therefore
// `string`, matching what a consumer actually receives.
//
// SCOPE OF THIS FILE: only the parts of the payload this module reads.
// The dashboard response also carries `fleetHealth.trends`,
// `fleetHealth.recommendations`, per-prediction `historicalPatterns`
// and similar; they are deliberately omitted rather than mirrored
// unused, so nothing here can drift on a field nobody renders.

import type { DriverRiskBatchResult } from '@/frontend/modules/ai/types/driver-risk.types';

/** Mirrors AISeverity (modules/ai/types/ai.types.ts). */
export type AiSeverity = 'low' | 'medium' | 'high' | 'critical';

/**
 * Mirrors AIBatchItem<T>.
 *
 * READ THE SUCCESS/DATA SEMANTICS BEFORE COUNTING ANYTHING HERE. The
 * three batches on this payload do NOT agree on what `success` means:
 *
 *   predictiveMaintenance  success=false when no prediction was made
 *                          (healthy vehicle) AND when the vehicle
 *                          errored -- `failed` conflates the two.
 *   fuelFraud              same: success=false covers "no anomalies
 *                          detected", "insufficient fuel data" and a
 *                          genuine error alike.
 *   expenseAnomalies       DIFFERENT: every expense is pushed with
 *                          success=true, and a NON-anomalous expense
 *                          carries `data: undefined`. `succeeded` here
 *                          is the number of expenses examined, not the
 *                          number of alerts.
 *
 * The one predicate that means "a finding exists" across all three is
 * `success === true && data !== undefined`. See countBatchFindings() in
 * ../utils/leaderboard.utils.ts, which is the only place this module
 * counts a batch.
 */
export interface AiBatchItem<T> {
  entityId: string;
  success: boolean;
  data?: T;
  error?: string;
}

/** Mirrors AIBatchResult<T>. */
export interface AiBatchResult<T> {
  success: boolean;
  results: AiBatchItem<T>[];
  total: number;
  /** NOT an alert count -- see the note on AiBatchItem. */
  succeeded: number;
  /** NOT an error count for predictiveMaintenance/fuelFraud -- see the note on AiBatchItem. */
  failed: number;
  /** ISO timestamp string. */
  timestamp: string;
  metadata?: Record<string, unknown>;
}

/** Mirrors PredictiveMaintenancePrediction, narrowed to the fields this module renders. */
export interface PredictiveMaintenancePrediction {
  predictionId: string;
  /** The vehicle's `_id`. Joinable with FuelFraudAlert.vehicleId and FleetHealthVehicleScore.vehicleId. */
  vehicleId: string;
  licensePlate: string;
  component: string;
  /** ISO timestamp string. */
  predictedFailureDate: string;
  confidence: number;
  severity: AiSeverity;
  estimatedCost: number;
  recommendedAction: string;
  urgency: 'immediate' | 'soon' | 'planned' | 'monitor';
}

/** Mirrors FuelFraudAlert, narrowed to the fields this module renders. */
export interface FuelFraudAlert {
  alertId: string;
  /** The vehicle's `_id`. Joinable with PredictiveMaintenancePrediction.vehicleId. */
  vehicleId: string;
  licensePlate: string;
  confidence: number;
  severity: AiSeverity;
  /** ISO timestamp string. */
  timestamp: string;
  status: 'open' | 'investigating' | 'confirmed' | 'false_positive';
}

/**
 * Mirrors ExpenseAnomalyAlert, narrowed to the fields this module reads.
 *
 * NOT VEHICLE-ATTRIBUTABLE. `entityId` is the EXPENSE record's own
 * `_id` (see expense-anomaly-detection.service.ts's createAlert), and
 * `entityType` is 'vehicle' merely when the expense had a
 * `license_plate` -- the plate itself is never carried on the alert.
 * There is therefore no way to attribute an expense anomaly to a
 * vehicle from this payload, which is why the vehicle leaderboard's
 * alert metric counts predictive-maintenance and fuel-fraud findings
 * only. See docs/leaderboard/BACKEND_AGGREGATION_GAPS.md.
 */
export interface ExpenseAnomalyAlert {
  alertId: string;
  /** The expense record's `_id` -- NOT a vehicle or driver id. */
  entityId: string;
  entityType: 'vehicle' | 'organization' | 'driver';
  confidence: number;
  severity: AiSeverity;
  /** ISO timestamp string. */
  timestamp: string;
  status: 'open' | 'investigating' | 'confirmed' | 'false_positive';
}

/** One entry of FleetHealthScore.vehicleScores. */
export interface FleetHealthVehicleScore {
  vehicleId: string;
  licensePlate: string;
  /** 0-100, higher = healthier (opposite polarity to a risk score). */
  score: number;
  components: Record<string, number>;
}

/** Mirrors FleetHealthScore, narrowed to the fields this module reads. */
export interface FleetHealthScore {
  /** 0-100, higher = healthier. */
  overallScore: number;
  /** ISO timestamp string. */
  timestamp: string;
  vehicleScores: FleetHealthVehicleScore[];
  metrics: {
    averageVehicleAge: number;
    averageMileage: number;
    maintenanceCompletionRate: number;
    pendingMaintenanceCount: number;
    overdueMaintenanceCount: number;
    averageDowntime: number;
    fuelEfficiencyAverage: number;
  };
}

/**
 * The full GET /api/ai/dashboard payload.
 *
 * Every panel is independently nullable: getAIDashboard() maps each
 * service's failure to `null` rather than failing the whole response
 * (`health.success ? health.data : null`, and so on). A null panel means
 * "this source did not produce an answer", which is NOT the same as
 * "the answer is zero" -- nothing in this module may render a 0 for a
 * null panel.
 */
export interface AiDashboardSummary {
  fleetHealth: FleetHealthScore | null;
  predictiveMaintenance: AiBatchResult<PredictiveMaintenancePrediction> | null;
  /**
   * Reuses the ai module's own frontend-owned driver-risk types rather
   * than restating them -- they already mirror this exact shape (see
   * frontend/modules/ai/types/driver-risk.types.ts) and the Driver
   * Scorecard is built on them, so a second copy could only drift.
   */
  driverRisk: DriverRiskBatchResult | null;
  fuelFraud: AiBatchResult<FuelFraudAlert> | null;
  expenseAnomalies: AiBatchResult<ExpenseAnomalyAlert> | null;
  /** ISO timestamp string. */
  timestamp: string;
}
