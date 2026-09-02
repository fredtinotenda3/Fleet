// frontend/modules/ai/types/driver-risk.types.ts
//
// Mirrors modules/ai/types/ai.types.ts (DriverRiskScore, AIResult,
// AIBatchResult, AIBatchItem) and modules/ai/types/ai-evidence.types.ts
// (AIEvidence) field-for-field, as returned by GET /api/ai/driver-risk
// (app/api/ai/driver-risk/route.ts -> aiController.getDriverRisk ->
// driverRiskService.calculateDriverRisk).
//
// This module owns its own copy rather than importing the backend
// module's types directly -- modules/ai/types/*.ts lives under modules/
// (server-only tree), and frontend modules do not import server-tree
// files (same convention workflows/types/index.ts and
// observability/types/index.ts already follow).
//
// DATE HANDLING: every `Date` field on the backend types (timestamp,
// trends[].date, incidents[].date) crosses the wire as a JSON string
// (Date.toJSON()/ISO 8601) once serialized by NextResponse.json() --
// JSON has no Date type, and apiClient does not revive dates on the
// way back in. All date-like fields below are therefore typed
// `string`, not `Date`, to match what a consumer actually receives.
//
// TWO RESPONSE SHAPES, ONE ROUTE:
//   GET /api/ai/driver-risk             -> data: DriverRiskBatchResult
//   GET /api/ai/driver-risk?driverId=X  -> data: DriverRiskScore
// (see ai.controller.ts's getDriverRisk: driverId present -> returns
// the single matching AIBatchItem's `.data`; absent -> returns the
// whole AIBatchResult). apiClient.get() already unwraps the outer
// `{ success, data, meta }` envelope, so callers of driverRiskApi get
// exactly one of these two shapes back, never the envelope itself.

/**
 * Mirrors AIEvidence (modules/ai/types/ai-evidence.types.ts). Points at
 * a stored record the score rested on -- `reference` is an id a reader
 * could look up, not a description. Never fabricate or reformat these
 * fields; render them as-is.
 */
export interface DriverRiskEvidence {
  /** Collection name or named computation, e.g. 'tbltelematics', 'tbltrips'. */
  source: string;
  /** An identifier resolvable back to the stored record. */
  reference: string;
  /** ISO timestamp string. When the referenced fact was true, if that differs from now. */
  observedAt?: string;
  /** The single number that drove the finding, when there is one. */
  value?: number;
}

export type DriverRiskLevel = 'low' | 'medium' | 'high' | 'critical';

/** Mirrors DriverRiskScore['metrics']. */
export interface DriverRiskMetrics {
  speedingEvents: number;
  hardBrakes: number;
  hardAccelerations: number;
  /** Hours. */
  idlingTime: number;
  nightDrivingHours: number;
  /** 0-100, higher = more fatigued. */
  fatigueScore: number;
  /** 0-100, higher = more distracted. */
  distractionScore: number;
  /** 0-100, higher = safer (see calculateSafetyScore -- inverted vs. the others). */
  safetyScore: number;
}

/** One point of DriverRiskScore['trends']: a 7-day-window risk score. */
export interface DriverRiskTrendPoint {
  /** ISO timestamp string -- the end of the 7-day window this point summarizes. */
  date: string;
  /** 0-100, higher = riskier. 0 when the window had no telematics data (never fabricated). */
  score: number;
}

/** One entry of DriverRiskScore['incidents']. */
export interface DriverRiskIncident {
  /** ISO timestamp string. */
  date: string;
  type: string;
  /**
   * Free-text severity on the wire ('High' | 'Medium' today per
   * speedingSeverity()/collectIncidents(), but the backend type is
   * `string`, not a literal union -- kept as `string` here so this
   * type does not silently reject a value the backend is free to add).
   */
  severity: string;
  /** "lat, lng" formatted string, or "," if both were missing. */
  location: string;
}

/**
 * Mirrors DriverRiskScore (modules/ai/types/ai.types.ts). The shape
 * returned for a single driver: GET /api/ai/driver-risk?driverId=X.
 */
export interface DriverRiskScore {
  /**
   * The organization member's userId (OrganizationMember.userId), NOT
   * the tbldrivers collection's _id used elsewhere in this app (see
   * DriverSelect / useDriversList). driver-risk.service.ts flags this
   * itself as a KNOWN OPEN QUESTION: DriverSelect's roster and this
   * roster may not be the same collection. Do not pass a tbldrivers
   * _id into driverId here expecting a match -- only ids that came
   * back from THIS endpoint (entityId in the batch response, or
   * driverId on a single-driver response) are guaranteed to round-trip.
   */
  driverId: string;
  driverName: string;
  /** 0-100. Lower = safer (opposite polarity to safetyScore in metrics). */
  overallScore: number;
  riskLevel: DriverRiskLevel;
  /** ISO timestamp string. */
  timestamp: string;
  metrics: DriverRiskMetrics;
  trends: DriverRiskTrendPoint[];
  recommendations: string[];
  incidents: DriverRiskIncident[];
  /**
   * Omitted (not an empty array) when the driver had no trips and no
   * telemetry to cite -- absence means "scored on no data", not "we
   * forgot to attach evidence". Never render an empty state here as if
   * it were an empty array; check for the field's presence.
   */
  evidence?: DriverRiskEvidence[];
}

/** Mirrors AIBatchItem<DriverRiskScore>. */
export interface DriverRiskBatchItem {
  /** Same OrganizationMember.userId as DriverRiskScore.driverId. */
  entityId: string;
  success: boolean;
  data?: DriverRiskScore;
  error?: string;
}

/**
 * Mirrors AIBatchResult<DriverRiskScore>. The shape returned for
 * GET /api/ai/driver-risk with no driverId -- every driver in the
 * caller's scope, each individually success/failure-flagged.
 */
export interface DriverRiskBatchResult {
  success: boolean;
  results: DriverRiskBatchItem[];
  total: number;
  succeeded: number;
  failed: number;
  /** ISO timestamp string. */
  timestamp: string;
  metadata?: Record<string, unknown>;
}
