// modules/vehicles/dto/vehicle-response.dto.ts

import { Vehicle } from '@/shared/types/vehicle.types';
import { DriverRef } from '@/shared/types/driver.types';

export class VehicleResponseDto {
  _id: string;
  license_plate: string;
  make: string;
  model: string;
  year: number;
  vehicle_type: string;
  purchase_date: string;
  fuel_type: string;
  color: string | null;
  vin: string | null;
  status: string;
  registration_expiry: string | null;
  insurance_provider: string | null;
  last_service_date: string | null;
  service_interval: number | null;
  odometer: number | null;
  /** Raw id of the vehicle's current driver, or null when unassigned. Always present so API consumers don't need a driver lookup just to know assignment state. */
  currentDriverId: string | null;
  /**
   * Minimal embeddable driver reference, resolved by the caller and
   * passed in explicitly (e.g. by the assign/unassign handler, which
   * already has the driver record in hand). Deliberately NOT resolved
   * inside this DTO -- doing so here would force every list/detail call
   * site into an N+1 driver lookup. Callers that don't have (or don't
   * need) the driver record simply omit it; it then reports `null`
   * rather than lying about assignment state -- `currentDriverId` above
   * is the source of truth for "is a driver assigned", this field is
   * purely a display convenience matching the frontend's
   * VehicleWithAssignment contract (frontend/modules/vehicles/types/index.ts).
   */
  assignedDriver: DriverRef | null;
  createdAt: Date;
  updatedAt: Date;

  constructor(vehicle: Vehicle, assignedDriver: DriverRef | null = null) {
    this._id = vehicle._id!;
    this.license_plate = vehicle.license_plate;
    this.make = vehicle.make;
    this.model = vehicle.model;
    this.year = vehicle.year;
    this.vehicle_type = vehicle.vehicle_type;
    this.purchase_date = vehicle.purchase_date;
    this.fuel_type = vehicle.fuel_type;
    this.color = vehicle.color || null;
    this.vin = vehicle.vin || null;
    this.status = vehicle.status || 'active';
    this.registration_expiry = vehicle.registration_expiry || null;
    this.insurance_provider = vehicle.insurance_provider || null;
    this.last_service_date = vehicle.last_service_date || null;
    this.service_interval = vehicle.service_interval || null;
    this.odometer = vehicle.odometer || null;
    this.currentDriverId = vehicle.currentDriverId || null;
    this.assignedDriver = assignedDriver;
    // BaseEntity.createdAt/updatedAt are typed `Timestamp` (Date | string)
    // since Mongo can round-trip them as ISO strings; normalize to Date here.
    this.createdAt = new Date(vehicle.createdAt!);
    this.updatedAt = new Date(vehicle.updatedAt!);
  }

  static fromVehicle(vehicle: Vehicle, assignedDriver: DriverRef | null = null): VehicleResponseDto {
    return new VehicleResponseDto(vehicle, assignedDriver);
  }

  static fromVehicles(vehicles: Vehicle[]): VehicleResponseDto[] {
    return vehicles.map(v => new VehicleResponseDto(v));
  }
}