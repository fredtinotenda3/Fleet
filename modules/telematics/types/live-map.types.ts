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