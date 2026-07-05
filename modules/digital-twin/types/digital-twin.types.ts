// modules/digital-twin/types/digital-twin.types.ts

import { BaseEntity } from '@/shared/types/common.types';

export type TwinAlertSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface TwinAlert {
  id: string;
  source: 'telematics' | 'maintenance' | 'compliance' | 'workorder' | 'system';
  type: string;
  severity: TwinAlertSeverity;
  message: string;
  raisedAt: Date;
  acknowledged: boolean;
}

export interface TwinLocation {
  lat: number;
  lng: number;
  speed: number;
  heading: number;
  accuracy?: number;
  recordedAt: Date;
}

export interface TwinSensorSnapshot {
  rpm?: number;
  coolantTemp?: number;
  fuelLevel?: number;
  throttlePosition?: number;
  engineLoad?: number;
  dtcCodes: string[];
  recordedAt?: Date;
}

export interface TwinFuelSummary {
  lastFuelDate?: Date;
  lastFuelVolume?: number;
  lastFuelCost?: number;
  fuelYTD: number;
  costYTD: number;
  averageEfficiency: number | null;
}

export interface TwinTripSummary {
  lastTripDate?: Date;
  distanceYTD: number;
  tripCountYTD: number;
}

export interface TwinDriverAssignment {
  driverId?: string;
  driverName?: string;
  assignedAt?: Date;
}

export interface TwinMaintenanceSummary {
  lastServiceDate?: Date;
  nextDueDate?: Date;
  openReminders: number;
  overdueReminders: number;
}

export interface TwinRepairSummary {
  openWorkOrders: number;
  lastCompletedAt?: Date;
  lastWorkOrderId?: string;
}

export interface TwinTireRecord {
  position: string;
  installedAt?: Date;
  treadDepthMm?: number;
  status: 'ok' | 'watch' | 'replace';
}

export interface TwinDocumentRef {
  type: 'registration' | 'insurance' | 'inspection' | 'other';
  label: string;
  url?: string;
  expiresAt?: Date;
}

export interface TwinInsuranceStatus {
  provider?: string;
  policyNumber?: string;
  expiryDate?: Date;
  status: 'active' | 'expiring_soon' | 'expired' | 'unknown';
}

export interface TwinInspectionStatus {
  lastInspectionDate?: Date;
  nextDueDate?: Date;
  status: 'ok' | 'due_soon' | 'overdue' | 'unknown';
}

export interface TwinCurrentState {
  status: string;
  odometer: number;
  healthScore: number; // 0-100 heuristic
  lastUpdated: Date;
}

/**
 * VehicleDigitalTwin is a read-optimized, event-maintained aggregate
 * projecting the complete live state of a single vehicle across every
 * domain module. It is NOT a system of record â€” each section's source
 * of truth remains its own domain module/collection. This is a
 * materialized view kept eventually-consistent via domain event
 * subscription (see DigitalTwinProjectionHandler), rebuildable at any
 * time from source data via DigitalTwinService.rebuildTwin().
 */
export interface VehicleDigitalTwin extends BaseEntity {
  vehicleId: string;
  license_plate: string;
  currentState: TwinCurrentState;
  location: TwinLocation | null;
  sensors: TwinSensorSnapshot | null;
  fuel: TwinFuelSummary;
  trips: TwinTripSummary;
  driver: TwinDriverAssignment;
  maintenance: TwinMaintenanceSummary;
  repairs: TwinRepairSummary;
  tires: TwinTireRecord[];
  documents: TwinDocumentRef[];
  insurance: TwinInsuranceStatus;
  inspection: TwinInspectionStatus;
  alerts: TwinAlert[];
  version: number;
  lastEventName?: string;
  lastRebuiltAt?: Date;
}

export interface DigitalTwinFilters {
  status?: string;
  hasActiveAlerts?: boolean;
  minSeverity?: TwinAlertSeverity;
}

export interface FleetTwinSummary {
  totalVehicles: number;
  withActiveAlerts: number;
  criticalAlerts: number;
  overdueMaintenance: number;
  expiredInsurance: number;
  averageHealthScore: number;
}