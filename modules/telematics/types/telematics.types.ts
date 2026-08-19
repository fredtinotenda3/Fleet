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
  lastPingAt?: Date;
  lastLocation?: TelematicsLocation;
  metadata: Record<string, any>;
}

export interface TelematicsLocation {
  lat: number;
  lng: number;
  speed: number;
  heading: number;
  altitude: number;
  accuracy: number;
  timestamp: Date;
}

export interface TelematicsData extends BaseEntity {
  deviceId: string;
  vehicleId: string;
  location?: TelematicsLocation;
  engine: {
    rpm: number;
    coolantTemp: number;
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
    throttlePosition: number;
    engineLoad: number;
    dtcCodes?: string[];
  };
  trip: {
    odometer: number;
    tripDistance: number;
    tripDuration: number;
    averageSpeed: number;
    maxSpeed: number;
    idleTime: number;
  };
  fuel: {
    consumptionRate: number;
    instantConsumption: number;
    fuelUsed: number;
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
  type: 'speeding' | 'hard_brake' | 'hard_accel' | 'idle' | 'geofence' | 'engine' | 'maintenance';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  value?: number;
  threshold?: number;
  timestamp: Date;
  acknowledgedAt?: Date;
  acknowledgedBy?: string;
}

export interface Geofence extends BaseEntity {
  name: string;
  vehicleId?: string;
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