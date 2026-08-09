// modules/telematics/adapters/cartrack/cartrack.types.ts
//
// Shapes for Cartrack's Fleet API. We don't have production Cartrack
// credentials or a sandbox at the time of writing, so these types
// follow Cartrack's publicly documented Fleet API conventions (Basic
// auth over HTTPS, vehicle status keyed by `terminal_serial`/
// `registration`, position nested under `position`). If the shape of a
// real tenant's response differs, the only file that needs to change is
// cartrack-api.client.ts's response parsing -- everything downstream
// (the adapter, the ingest pipeline, alerts, geofencing) is written
// against CartrackVehicleStatus below, not the wire format directly.

/** One vehicle's current telemetry snapshot, as returned by GET /vehicles/status. */
export interface CartrackVehicleStatus {
  /** Cartrack's own identifier for the vehicle/terminal. */
  terminal_serial: string;
  /** Number plate as registered with Cartrack -- the join key back to our Vehicle.license_plate. */
  registration: string;
  position: {
    latitude: number;
    longitude: number;
    /** km/h */
    speed: number;
    /** compass degrees, 0-360 */
    heading: number;
    /** metres */
    altitude?: number;
    /** ISO-8601 timestamp of the fix */
    position_date: string;
  };
  ignition_on: boolean;
  odometer_km?: number;
  fuel_level_percent?: number;
  /** Cartrack's own event/alert feed for this vehicle since the last poll. */
  events?: CartrackEvent[];
}

export interface CartrackEvent {
  event_type: 'speeding' | 'harsh_braking' | 'harsh_acceleration' | 'towing' | 'panic' | 'geofence' | string;
  event_date: string;
  value?: number;
  threshold?: number;
  description?: string;
}

export interface CartrackVehicleStatusResponse {
  data: CartrackVehicleStatus[];
}

/** Per-tenant Cartrack credentials, as stored (API secret is encrypted at rest). */
export interface CartrackConfig {
  tenantId: string;
  enabled: boolean;
  /** Cartrack "Account Id" -- identifies which fleet within Cartrack's platform to pull. */
  accountId: string;
  apiKey: string;
  /** Stored as ciphertext (EncryptionService); decrypted just before building the API client. */
  apiSecretEncrypted: string;
  baseUrl: string;
  lastSyncAt?: Date;
  lastSyncStatus?: 'success' | 'error';
  lastSyncError?: string;
  createdAt: Date;
  updatedAt: Date;
  updatedBy?: string;
}

export interface CartrackSyncResult {
  tenantId: string;
  matched: number;
  unmatchedRegistrations: string[];
  errors: string[];
  syncedAt: Date;
}