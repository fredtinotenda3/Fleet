// modules/telematics/types/live-map.types.ts
//
// Response shape for GET /api/telematics/live-map. Kept separate from
// telematics.types.ts (the storage-layer TelematicsData/Geofence shapes)
// because this is a read-model assembled from several sources (vehicle
// records, latest telematics fix or demo simulation, geofences) rather
// than a persisted entity.

export type LiveMapVehicleStatus = 'moving' | 'idle' | 'offline';
/**
 * Which pipeline produced the position shown for a vehicle.
 *
 * 'eagletrack' was added alongside the Eagle Track provider adapter.
 * Purely additive: 'cartrack' remains the label for every reading that
 * is not identifiably from another provider, so no existing consumer
 * changes behaviour. See live-map.service.ts's resolveRealVehicle for
 * how the label is derived (device-id prefix) and why it is currently
 * approximate.
 */
export type LiveMapDataSource = 'cartrack' | 'eagletrack' | 'demo' | 'unavailable';

export interface LiveMapVehicle {
  vehicleId: string;
  licensePlate: string;
  make: string;
  model: string;
  orgUnitId?: string;
  status: LiveMapVehicleStatus;
  source: LiveMapDataSource;
  position: {
    lat: number;
    lng: number;
    speed: number;
    heading: number;
    fuelLevel?: number;
    timestamp: string;
  } | null;
}

export interface LiveMapGeofence {
  id: string;
  name: string;
  type: 'circle' | 'polygon' | 'route';
  coordinates: unknown;
  active: boolean;
}

export interface LiveMapPayload {
  demoMode: boolean;
  generatedAt: string;
  vehicles: LiveMapVehicle[];
  geofences: LiveMapGeofence[];
}

export interface DemoModeStatus {
  enabled: boolean;
  startedAt?: string;
}

/** One point in a vehicle's recent route trail, used to draw the breadcrumb line on the live map. */
export interface LiveMapRoutePoint {
  lat: number;
  lng: number;
  speed: number;
  timestamp: string;
}

export interface LiveMapRouteHistory {
  vehicleId: string;
  points: LiveMapRoutePoint[];
}

/**
 * Full live-telemetry detail for one vehicle, as already ingested and
 * stored on TelematicsData -- shown in the vehicle detail panel when a
 * vehicle is selected on the live map. A superset of the compact
 * `LiveMapVehicle.position` used for the map marker itself, which only
 * carries what's needed to draw a pin (lat/lng/speed/heading/fuelLevel).
 *
 * Every field mirrors an existing TelematicsData/EagleTrackReadingMetadata
 * field one-to-one -- nothing here is invented. A field that is optional
 * on the source type stays optional here, so the UI can render "No data"
 * for it instead of a misleading 0/blank.
 */
export interface LiveMapVehicleDetail {
  vehicleId: string;
  status: LiveMapVehicleStatus;
  source: LiveMapDataSource;
  location: {
    lat: number;
    lng: number;
    speed: number;
    heading: number;
    timestamp: string;
  } | null;
  /** Seconds since this fix was recorded; null when the vehicle has never reported a fix. */
  fixAgeSeconds: number | null;
  odometer?: number;
  trip?: {
    tripDistance: number;
    tripDuration: number;
    averageSpeed: number;
    maxSpeed: number;
    idleTime: number;
  };
  engine?: {
    rpm?: number;
    coolantTemp?: number;
    fuelLevel?: number;
    throttlePosition?: number;
    engineLoad?: number;
    dtcCodes?: string[];
  };
  fuel?: {
    consumptionRate?: number;
    instantConsumption?: number;
    fuelUsed?: number;
  };
  /** Device-health signals -- currently only populated for Eagle Track fixes (see EagleTrackReadingMetadata.signalQuality); absent for Cartrack/demo. */
  deviceHealth?: {
    batteryPercent?: number;
    gsmQuality?: number;
    gpsSatellites?: number;
  };
}