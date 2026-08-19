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