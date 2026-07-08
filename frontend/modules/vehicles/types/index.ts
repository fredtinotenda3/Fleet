//app/modules/vehicles/types/index.ts

// frontend/modules/vehicles/types/index.ts

import type { Vehicle, VehicleFilters, VehicleStats } from '@/shared/types/vehicle.types';
import type { PaginationParams, PaginatedResponse, Status } from '@/shared/types/common.types';

export type { Vehicle, VehicleFilters, VehicleStats, PaginationParams, PaginatedResponse };

/**
 * The backend's update-status command only accepts these three values
 * (see modules/vehicles/commands/handlers/update-vehicle-status.handler.ts
 * VALID_STATUSES), even though the shared `Status` type also allows
 * 'archived'. Narrowed here so the UI can't offer a status the API will
 * reject with INVALID_STATUS.
 */
export type VehicleStatus = Extract<Status, 'active' | 'inactive' | 'maintenance'>;

export const VEHICLE_STATUSES: VehicleStatus[] = ['active', 'inactive', 'maintenance'];

export interface VehicleTableFilters extends VehicleFilters {
  /** Free-text search routed to GET /api/vehicles/search (plate/make/model/VIN). */
  search?: string;
}

/** Row shape returned by GET /api/vehicles/analytics (fleet-wide, ranked by operating cost). */
export interface VehicleAnalyticsRow {
  _id: string;
  license_plate: string;
  make: string;
  model: string;
  year: number;
  status: string;
  totalExpenses: number;
  totalFuelCost: number;
  totalFuelVolume: number;
  totalOperatingCost: number;
}

/** Entry from GET /api/security/audit-log?entityType=vehicle&entityId=... */
export interface VehicleActivityEntry {
  _id: string;
  action: string;
  category?: string;
  severity?: string;
  userId?: string;
  entityType?: string;
  entityId?: string;
  changes?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  createdAt?: string;
  recordedAt?: string;
}

export interface VehicleColumnVisibility {
  make: boolean;
  model: boolean;
  year: boolean;
  vehicle_type: boolean;
  fuel_type: boolean;
  status: boolean;
  odometer: boolean;
  registration_expiry: boolean;
  insurance_provider: boolean;
}

export const DEFAULT_VEHICLE_COLUMN_VISIBILITY: VehicleColumnVisibility = {
  make: true,
  model: true,
  year: true,
  vehicle_type: true,
  fuel_type: true,
  status: true,
  odometer: true,
  registration_expiry: false,
  insurance_provider: false,
};