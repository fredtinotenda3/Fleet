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
    fuelLevel: number;
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