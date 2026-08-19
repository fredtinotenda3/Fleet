// modules/telematics/types/live-map.types.ts
//
// Response shape for GET /api/telematics/live-map. Kept separate from
// telematics.types.ts (the storage-layer TelematicsData/Geofence shapes)
// because this is a read-model assembled from several sources (vehicle
// records, latest telematics fix or demo simulation, geofences) rather
// than a persisted entity.

/**
 * MOTION / CONNECTIVITY state only.
 *
 * NOTE WHAT IS NOT IN THIS UNION: 'alert'. An alerting vehicle is still
 * either moving, idle or offline, and collapsing the two concepts would
 * silently break every consumer that buckets a fleet by status --
 * MapsWidget counts moving + idle + offline and expects them to sum to
 * the fleet total, so an 'alert' member would make alerting vehicles
 * vanish from all three buckets. Alert state is carried separately on
 * `LiveMapVehicle.alert`, which also means a red marker keeps its
 * heading wedge instead of losing the direction information.
 */
export type LiveMapVehicleStatus = 'moving' | 'idle' | 'offline';

/** Mirrors TelematicsAlert['severity'] so the two never drift. */
export type LiveMapAlertSeverity = 'low' | 'medium' | 'high' | 'critical';

/**
 * Why a vehicle is flagged on the map, derived from its LATEST READING
 * rather than from the alert store -- see reading-alerts.ts's header for
 * the two reasons (N+1 across 500 vehicles per 10s poll, and
 * tbltelematics_alerts rows carrying no orgUnitId).
 */
export interface LiveMapAlertState {
  severity: LiveMapAlertSeverity;
  /** Deduplicated, human-readable causes, worst first. Never empty when this object is present. */
  reasons: string[];
}
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
  /**
   * SECONDARY indicator, never the status itself.
   *
   * True when the fix is older than STALE_FIX_MINUTES but the vehicle is
   * not (yet) offline by the rules in resolveLiveStatus. Before this
   * field existed, that same 15-minute threshold WAS the status
   * decision, which is why every vehicle in a fleet polled less often
   * than every 15 minutes rendered as offline. The UI surfaces this as a
   * "stale fix" hint next to the real status.
   */
  stale: boolean;
  /** Non-null when the latest reading implies an alert; renders the marker red. Independent of `status`. */
  alert: LiveMapAlertState | null;
  source: LiveMapDataSource;
  position: {
    lat: number;
    lng: number;
    speed: number;
    /** Absent when the provider did not report a bearing -- see TelematicsLocation.heading. The map draws no direction wedge in that case rather than pointing every such vehicle north. */
    heading?: number;
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
  /** See LiveMapVehicle.stale -- secondary indicator, not the status. */
  stale: boolean;
  /** See LiveMapVehicle.alert. */
  alert: LiveMapAlertState | null;
  source: LiveMapDataSource;
  location: {
    lat: number;
    lng: number;
    speed: number;
    /** Absent when the provider did not report a bearing. */
    heading?: number;
    timestamp: string;
  } | null;
  /** Seconds since this fix was recorded; null when the vehicle has never reported a fix. */
  fixAgeSeconds: number | null;
  odometer?: number;
  trip?: {
    tripDistance?: number;
    tripDuration?: number;
    averageSpeed?: number;
    maxSpeed?: number;
    idleTime?: number;
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
  /**
   * Device-health signals -- currently only populated for Eagle Track
   * fixes; absent for Cartrack/demo.
   *
   * batteryPercent/gsmQuality/gpsSatellites come from the `signalex`
   * triplet (EagleTrackReadingMetadata.signalQuality). batteryVoltage
   * and powerVoltage come from the IO metadata bag
   * (EagleTrackReadingMetadata.io), where the adapter records signals
   * that have no first-class TelematicsData field -- io 176 (device
   * battery, V) and io 179 (vehicle supply, V). They are two different
   * measurements of two different batteries and are reported separately
   * rather than merged.
   */
  deviceHealth?: {
    batteryPercent?: number;
    gsmQuality?: number;
    gpsSatellites?: number;
    /** Tracker's own backup battery, volts. */
    batteryVoltage?: number;
    /** Vehicle supply voltage seen by the tracker, volts. */
    powerVoltage?: number;
  };
}