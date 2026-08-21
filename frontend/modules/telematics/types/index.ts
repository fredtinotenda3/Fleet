// frontend/modules/telematics/types/index.ts

import type {
  LiveMapPayload,
  LiveMapVehicle,
  LiveMapVehicleDetail,
  LiveMapGeofence,
  LiveMapVehicleStatus,
  LiveMapDataSource,
  LiveMapRouteHistory,
  LiveMapRoutePoint,
  DemoModeStatus,
} from '@/modules/telematics/types/live-map.types';
// LiveMapPayload now also carries eagletrackLastSyncAt /
// eagletrackLastSyncStatus (see live-map.types.ts) -- re-exported as-is
// below, no separate frontend-only type needed.

export type {
  LiveMapPayload,
  LiveMapVehicle,
  LiveMapVehicleDetail,
  LiveMapGeofence,
  LiveMapVehicleStatus,
  LiveMapDataSource,
  LiveMapRouteHistory,
  LiveMapRoutePoint,
  DemoModeStatus,
};

/** Cartrack config as returned by GET/PUT /api/telematics/cartrack/config -- apiSecret is never present, only apiKey (a non-secret account identifier). */
export interface CartrackConfigStatus {
  configured: boolean;
  enabled: boolean;
  accountId?: string;
  apiKey?: string;
  baseUrl?: string;
  lastSyncAt?: string;
  lastSyncStatus?: 'success' | 'error';
  lastSyncError?: string;
}

export interface CartrackConfigInput {
  accountId: string;
  apiKey: string;
  apiSecret: string;
  baseUrl: string;
  enabled: boolean;
}

export interface CartrackSyncResult {
  tenantId: string;
  matched: number;
  unmatchedRegistrations: string[];
  errors: string[];
  syncedAt: string;
}

/**
 * POST /api/telematics/cartrack/test-connection response. The route
 * takes no body and verifies whatever is currently persisted for the
 * tenant (see cartrackAdapter.testConnection) -- it does NOT validate
 * unsaved form input, so the UI must prompt "save first" for a dirty form
 * rather than implying this checks in-progress edits.
 */
export interface CartrackTestConnectionResult {
  connected: boolean;
}

/**
 * Eagle Track config as returned by GET/PUT
 * /api/telematics/eagletrack/config.
 *
 * Note what is NOT here: there is no Eagle Track equivalent of
 * Cartrack's accountId/apiKey. The static API token is the entire
 * credential, so the response carries only the domain plus sync status
 * -- never the token, its ciphertext, or a masked prefix of it.
 */
export interface EagleTrackConfigStatus {
  configured: boolean;
  enabled: boolean;
  domain?: string;
  lastSyncAt?: string;
  lastSyncStatus?: 'success' | 'error';
  lastSyncError?: string;
}

export interface EagleTrackConfigInput {
  domain: string;
  token: string;
  enabled: boolean;
}

export interface EagleTrackSyncResult {
  tenantId: string;
  matched: number;
  /**
   * Which roster field each matched tracker resolved through. `link` is
   * the operator-declared uin -> vehicle mapping and outranks the three
   * vendor-text heuristics -- a fully-mapped account reports everything
   * under it.
   */
  matchedBy?: Record<'link' | 'plate' | 'platenumber' | 'name', number>;
  skippedStale: number;
  skippedNoFix: number;
  /** Trackers that produced a reading we could not attribute to a vehicle -- see the adapter's matching notes. */
  unmatchedTrackers: string[];
  /** Trackers on the roster that the fleet poll did not return a fix for. */
  trackersWithoutFix: string[];
  errors: string[];
  syncedAt: string;
}

/**
 * POST /api/telematics/eagletrack/test-connection response. Like
 * Cartrack's, the route takes no body and verifies whatever is currently
 * persisted for the tenant -- it does NOT validate unsaved form input,
 * so the UI must prompt "save first" for a dirty form.
 */
export interface EagleTrackTestConnectionResult {
  connected: boolean;
}
// ─── Eagle Track history / fuel / triggers / tracker mapping ─────────

/** One point of a vehicle's route trail. Chronological, oldest first. */
export interface EagleTrackHistoryPoint {
  lat: number;
  lng: number;
  speed: number;
  timestamp: string;
}

/**
 * GET /api/telematics/eagletrack/history/[vehicleId].
 *
 * `providerQuery` echoes the exact window and dateRange encoding that
 * went on the wire. It exists because the encoding is not confirmed
 * against a live deployment (see eagletrack-date-range.ts) -- when a
 * window comes back empty, this is what distinguishes "the vehicle did
 * not move" from "we asked the vendor the wrong way".
 */
export interface EagleTrackHistoryResult {
  vehicleId: string;
  uin: string | null;
  points: EagleTrackHistoryPoint[];
  ingested: {
    fetched: number;
    inserted: number;
    existing: number;
    pagesFetched: number;
    truncated: boolean;
  };
  alerts?: {
    fetched: number;
    imported: number;
    duplicates: number;
    unmatched: string[];
    errors: string[];
  };
  providerQuery: { from: string; to: string; encoding: string; encoded: string } | null;
  providerError?: string;
}

/** Cross-field inconsistencies the server detected on one row. Mirrors EagleTrackFuelRowFlag. */
export type EagleTrackFuelRowFlag =
  | 'zero-consumption-rate-without-fuel-used'
  | 'distance-odometer-mismatch'
  | 'odometer-decreased';

/**
 * One period row of the provider's fuel report.
 *
 * Every member except `uin` is optional because the provider may not
 * report it AND because the field names are not all confirmed -- see
 * `unmappedFields`, which lists the vendor keys no candidate alias
 * claimed. An absent figure is never rendered as 0.
 *
 * `noDataFields` is the stronger statement: those are fields the
 * provider EXPLICITLY marked "-". "We could not find the column" and
 * "the provider says it has no figure" both render as "No data", but
 * only the second is a fact about the vehicle.
 */
export interface EagleTrackFuelReportRow {
  uin: string;
  /** The tracker name the report row carries. NOT an identifier we attribute on -- the server decides that. */
  providerName?: string;
  periodStart?: string;
  periodEnd?: string;
  periodStartIso?: string;
  periodEndIso?: string;
  initialFuelLitres?: number;
  finalFuelLitres?: number;
  fuelConsumedLitres?: number;
  refuelledLitres?: number;
  drainedLitres?: number;
  refuelEventCount?: number;
  drainEventCount?: number;
  distanceKm?: number;
  startOdometerKm?: number;
  endOdometerKm?: number;
  consumptionPer100Km?: number;
  fuelCost?: number;
  fuelCostCurrencyCode?: string;
  fuelCostCurrencySymbol?: string;
  noDataFields: string[];
  unparsableFields: string[];
  flags: EagleTrackFuelRowFlag[];
  unmappedFields: string[];
  unmappedFuelSummaryLabels: string[];
}

export type EagleTrackFuelWarningCode =
  | 'rows-excluded-for-other-trackers'
  | 'no-row-matches-vehicle'
  | 'record-count-exceeds-returned-rows'
  | 'row-width-mismatch'
  | 'duplicate-columns'
  | 'provider-name-differs-from-plate'
  | 'mixed-fuel-cost-currencies'
  | 'row-consistency-flags';

/**
 * A qualification on the provider's answer.
 *
 * Rendered rather than swallowed. A total drawn from a partial or
 * partly-misattributed report is not wrong enough to withhold and not
 * right enough to present bare, and the whole reason the server returns
 * these is so the UI does not have to choose between the two.
 */
export interface EagleTrackFuelWarning {
  code: EagleTrackFuelWarningCode;
  detail: string;
}

export interface EagleTrackFuelReport {
  vehicleId: string;
  licensePlate: string;
  uin: string | null;
  rows: EagleTrackFuelReportRow[];
  canonicalFuel: { fuelUsed?: number; consumptionRate?: number };
  fuelCostTotal?: { amount: number; currencyCode?: string; currencySymbol?: string };
  unmappedFields: string[];
  unmappedFuelSummaryLabels: string[];
  noDataFields: string[];
  unparsableFields: string[];
  providerColumns: string[];
  providerCounters: { pageCount: number | null; recordCount: number | null };
  excludedRowCount: number;
  providerWarnings: EagleTrackFuelWarning[];
  providerQuery: { from: string; to: string; encoding: string; encoded: string } | null;
  providerError?: string;
}

export interface EagleTrackTriggerView {
  providerTriggerId: string;
  name?: string;
  typeCode: number | null;
  typeLabel: string | null;
  active?: boolean;
  uin?: string;
  vehicleId?: string;
  speedLimitKmh?: number;
  durationMinutes?: number;
  hasGeometry: boolean;
  geofenceId?: string;
  geofenceSkippedReason?: 'non-spatial' | 'no-geometry' | 'unknown-type';
  unmappedFields: string[];
  lastSeenAt: string;
}

/** A tracker the last sync could not attribute to any vehicle -- the mapping screen's worklist. */
export interface EagleTrackUnmatchedTracker {
  uin: string;
  name?: string;
  plate?: string;
  model?: string;
  /** Whether the fleet poll returned a position for it. A tracker with no fix has no telemetry to match on, so it is the likeliest to need linking by hand. */
  hadFix: boolean;
}

export interface EagleTrackTrackerLink {
  uin: string;
  vehicleId: string;
  licensePlate?: string;
  trackerName?: string;
  note?: string;
  updatedAt: string;
}

export interface EagleTrackTrackerMapping {
  unmatched: EagleTrackUnmatchedTracker[];
  links: EagleTrackTrackerLink[];
  lastSyncAt: string | null;
  eagletrackConfigured: boolean;
}
