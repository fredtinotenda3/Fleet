// modules/telematics/types/telematics.types.ts

import { BaseEntity } from '@/shared/types/common.types';

export interface TelematicsDevice extends BaseEntity {
  deviceId: string;
  vehicleId: string;
  type: 'gps' | 'obd2' | 'dashcam' | 'combined';
  manufacturer: string;
  model: string;
  firmwareVersion: string;
  status: 'active' | 'inactive' | 'offline';
  /**
   * REAL wall-clock time of the last successful ingest for this device --
   * i.e. "when did our server last hear from this device", independent of
   * whatever timestamp the provider's payload itself carried. This is
   * what offline detection (getOfflineDevices) means by "stale": a device
   * we have not successfully ingested from recently, regardless of what
   * the provider's own clock says.
   *
   * NOT a substitute for `lastFixAt` below, and must never be compared
   * against a provider-reported fix timestamp -- the two clocks have no
   * guaranteed relationship (network/poll latency, provider processing
   * lag, and provider timezone/clock drift all separate them), so
   * comparing a provider `date` field against this wall-clock value
   * produces a comparison between two unrelated timelines. See
   * eagletrack.adapter.ts's staleness guard for the incident this
   * caused: readings were skipped as "stale" essentially permanently
   * because a provider-time fix was being measured against
   * ingest-time wall clock.
   */
  lastPingAt?: Date;
  /**
   * The PROVIDER'S OWN reported timestamp for the last fix this device
   * successfully ingested (e.g. Eagle Track's `date` field, parsed).
   * This -- not `lastPingAt` -- is the correct baseline for a staleness
   * guard that decides whether a newly-polled fix is actually newer than
   * what we already hold: both sides of that comparison must come from
   * the same clock (the provider's), or "newer" is meaningless.
   *
   * Optional because not every provider adapter populates it (Cartrack's
   * poll has no staleness guard to begin with and always ingests).
   */
  lastFixAt?: Date;
  lastLocation?: TelematicsLocation;
  metadata: Record<string, any>;
}

export interface TelematicsLocation {
  lat: number;
  lng: number;
  speed: number;
  /**
   * Compass bearing in degrees, 0-360.
   *
   * OPTIONAL for the same reason `engine.fuelLevel` is (see its doc
   * comment below): "this device does not report a bearing" and "this
   * vehicle is heading due north" are different facts, and 0 is a
   * legitimate value for the second. A provider adapter that substitutes
   * 0 for an unreported bearing makes every non-reporting vehicle's
   * direction arrow on the live map point the same wrong way, which is a
   * confidently-wrong reading rather than a missing one.
   *
   * Widening (required -> optional) is source-compatible for the HTTP
   * ingest path, whose schema still requires it
   * (shared/validations/telematics.schema.ts), so only provider adapters
   * can omit it.
   */
  heading?: number;
  altitude: number;
  accuracy: number;
  timestamp: Date;
}

export interface TelematicsData extends BaseEntity {
  deviceId: string;
  vehicleId: string;
  location?: TelematicsLocation;
  /**
   * Engine signals from the reading.
   *
   * EVERY MEMBER IS OPTIONAL, and deliberately so. These fields are
   * displayed verbatim in the live-map vehicle detail panel, and a
   * fabricated 0 there is indistinguishable from a real reading of zero:
   * "0 rpm" reads as a stalled engine, "0 C" as a frozen one, "0%
   * throttle" as a closed pedal. Absent must stay absent all the way to
   * the UI so it can render "No data".
   *
   * The object itself stays required so existing readers
   * (`data.engine?.x`) keep their shape; an adapter with no engine
   * signals at all writes `{}`.
   */
  engine: {
    rpm?: number;
    coolantTemp?: number;
    /**
     * Fuel level as a PERCENTAGE, 0-100 (see
     * shared/validations/telematics.schema.ts, which constrains the HTTP
     * ingest payload to that range).
     *
     * OPTIONAL because "this device does not report fuel" and "this tank
     * is empty" are different facts and telematics.service.ts treats
     * them very differently: checkForAlerts raises a high-severity
     * "Low fuel level" alert -- and a fleet-manager notification --
     * for any value below 10. A provider adapter that substitutes 0 for
     * an unreported reading therefore manufactures that alert on every
     * single poll. Leaving the field absent makes the `< 10` comparison
     * false, which is the correct behaviour for an unknown value.
     *
     * Widening (required -> optional) is source-compatible for every
     * reader: the HTTP ingest schema still requires it, and the only
     * consumers (live-map.service.ts, digital-twin.service.ts) already
     * treat it as possibly-absent.
     */
    fuelLevel?: number;
    throttlePosition?: number;
    engineLoad?: number;
    dtcCodes?: string[];
  };
  /**
   * Trip/odometer aggregates. Optional members for the same reason as
   * `engine` above, plus one consequence worth naming: a fabricated
   * `odometer: 0` does not merely display wrongly, it WINS over the
   * vehicle's own recorded odometer in
   * digital-twin.service.ts's `latestTelemetry?.trip?.odometer ??
   * vehicle.odometer ?? 0` fallback chain. Omitting it restores that
   * fallback instead of overwriting real data with a placeholder.
   */
  trip: {
    odometer?: number;
    tripDistance?: number;
    tripDuration?: number;
    averageSpeed?: number;
    maxSpeed?: number;
    idleTime?: number;
  };
  /** Fuel-flow signals. Optional members for the same reason as `engine` above. */
  fuel: {
    consumptionRate?: number;
    instantConsumption?: number;
    fuelUsed?: number;
  };
  alerts?: TelematicsAlert[];
  /**
   * Provider-specific signals that have no first-class field on this
   * type -- device battery voltage, GSM/GPS signal quality, the vendor's
   * own alert ids, which IO code a value was read from.
   *
   * Exists so an adapter never has to force a foreign signal into an
   * unrelated field to keep it (battery volts into `engine.coolantTemp`,
   * litres into a percentage field). Opaque by design: nothing in the
   * alerting, geofencing or reporting paths reads it, so its contents
   * can never change how a reading is interpreted. Each provider
   * documents its own shape -- see EagleTrackReadingMetadata.
   */
  providerMetadata?: Record<string, unknown>;
  timestamp: Date;
}

export interface TelematicsAlert {
  /**
   * `'vendor'` is for a provider-side alert whose category has no
   * honest counterpart in the vocabulary above.
   *
   * Added for Eagle Track's trigger types 4 (Stop Alert) and 6 (Custom
   * Alert). Stop is NOT `'idle'`: idle means engine-running-while-
   * stationary everywhere else in this codebase (see the Eagle Track
   * adapter's `ignitionOn && speed === 0` derivation), so filing stops
   * as idle would inflate the idle metric with parked vehicles and
   * misattribute idle fuel burn once the finance module posts
   * telemetry-driven costs. Custom is operator-defined free text with no
   * category at all.
   *
   * The alternative was dropping both, which loses events the provider
   * genuinely sent. Safe to add: nothing in the codebase switches
   * exhaustively on this union, and its only reader interpolates it into
   * a notification title. See eagletrack-triggers.map.ts for the full
   * type-by-type mapping.
   */
  type:
    | 'speeding'
    | 'hard_brake'
    | 'hard_accel'
    | 'idle'
    | 'geofence'
    | 'engine'
    | 'maintenance'
    | 'vendor';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  value?: number;
  threshold?: number;
  timestamp: Date;
  acknowledgedAt?: Date;
  acknowledgedBy?: string;

  // ── Provider reconciliation (imported vendor alerts only) ──────────
  // All optional and absent on every alert our own engine derives, so
  // nothing existing changes shape. See
  // telematicsRepository.upsertVendorAlerts.

  /**
   * Stable identity of an IMPORTED provider alert -- the vendor's own
   * alert id where it supplies one, otherwise the uin+time+trigger tuple
   * that makes two rows the same event. The duplicate-prevention key for
   * re-running an import over an overlapping window.
   */
  providerAlertKey?: string;
  /** The vendor trigger object this alert fired from, for joining back to tbltelematics_eagletrack_triggers. */
  providerTriggerId?: string;
  /** The vendor's own numeric type, kept raw even when undocumented. */
  providerTypeCode?: number | null;
  /** The vendor's own label for that type, or null when the code is outside the documented range. */
  providerTypeLabel?: string | null;
  /** The provider row exactly as sent. Opaque, like TelematicsData.providerMetadata -- nothing branches on it. */
  providerMetadata?: Record<string, unknown>;
}

export interface Geofence extends BaseEntity {
  name: string;
  vehicleId?: string;
  /**
   * Set when this boundary was imported from a provider rather than
   * drawn by an operator. `provider` + `providerTriggerId` together are
   * the reconciliation key: a second sync matches on them and REFRESHES
   * the boundary instead of creating a duplicate.
   *
   * Matching on `name` instead would duplicate the geofence the moment
   * somebody renamed it in the vendor UI, and the orphaned copy would
   * keep firing entry/exit alerts nobody could find the source of.
   *
   * Absent on every operator-created geofence, so nothing existing
   * changes shape. See telematicsRepository.upsertProviderGeofence for
   * which fields a re-sync is allowed to overwrite and which are treated
   * as local operational choices.
   */
  provider?: string;
  providerTriggerId?: string;
  type: 'circle' | 'polygon' | 'route';
  coordinates: CircleCoordinates | PolygonCoordinates | RouteCoordinates;
  active: boolean;
  alerts: {
    entry: boolean;
    exit: boolean;
    inside: boolean;
  };
  schedule?: {
    startTime: string;
    endTime: string;
    daysOfWeek: number[];
  };
}

export interface CircleCoordinates {
  center: { lat: number; lng: number };
  radius: number; // meters
}

export interface PolygonCoordinates {
  points: Array<{ lat: number; lng: number }>;
}

export interface RouteCoordinates {
  points: Array<{ lat: number; lng: number }>;
  tolerance: number; // meters
}