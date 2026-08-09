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