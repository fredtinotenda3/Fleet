// shared/types/vehicle.types.ts

import { BaseEntity, Status } from './common.types';

export interface Vehicle extends BaseEntity {
  license_plate: string;
  make: string;
  model: string;
  year: number;
  vehicle_type: string;
  purchase_date: string;
  fuel_type: string;
  color?: string;
  vin?: string;
  status: Status;
  registration_expiry?: string;
  insurance_provider?: string;
  last_service_date?: string;
  last_service_odometer?: number;
  service_interval?: number;
  odometer?: number;
  image_url?: string;
  notes?: string;
  orgUnitId?: string;
  /**
   * The driver currently assigned to this vehicle, if any. Persistent
   * ("who has this vehicle right now") -- distinct from the time-boxed
   * driver references elsewhere in the schema (DriverShift.driverId,
   * DispatchJob.assignedDriverId, Trip.driver_id), none of which persist
   * "this vehicle's driver right now". Set/cleared exclusively via
   * PATCH /api/vehicles/:id/driver (see
   * modules/vehicles/commands/handlers/assign-vehicle-driver.handler.ts).
   *
   * BUSINESS RULE (decided in that handler, documented here since it
   * shapes this field's invariants): a vehicle has at most one current
   * driver (this field), and -- the decision the original spec doc
   * deliberately left open -- a driver may be the CURRENT driver of at
   * most one vehicle at a time. Assigning a driver who currently holds
   * another vehicle unassigns them from that vehicle in the same
   * operation, and infrastructure/database/indexes.vehicle-driver-addendum.ts
   * enforces this at the database level with a partial unique index.
   * A driver may of course still appear historically on many vehicles
   * (Trip.driver_id, DriverShift.driverId) -- only the notion of
   * "current" vehicle is exclusive.
   */
  currentDriverId?: string | null;
}

export interface VehicleCreateDTO {
  license_plate: string;
  make: string;
  model: string;
  year: number;
  vehicle_type: string;
  purchase_date: string;
  fuel_type: string;
  color?: string;
  vin?: string;
  status?: Status;
  registration_expiry?: string;
  insurance_provider?: string;
  service_interval?: number;
  odometer?: number;
  orgUnitId?: string;
}

export interface VehicleUpdateDTO extends Partial<VehicleCreateDTO> {
  _id: string;
}

export interface VehicleFilters {
  license_plate?: string;
  make?: string;
  model?: string;
  status?: Status;
  year?: number;
  vehicle_type?: string;
}

export interface VehicleStats {
  total: number;
  active: number;
  inactive: number;
  maintenance: number;
}