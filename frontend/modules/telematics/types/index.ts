// frontend/modules/telematics/types/index.ts

import type {
  LiveMapPayload,
  LiveMapVehicle,
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