// modules/vehicles/dto/vehicle-response.dto.ts

import { Vehicle } from '@/shared/types/vehicle.types';

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
  createdAt: Date;
  updatedAt: Date;

  constructor(vehicle: Vehicle) {
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
    // BaseEntity.createdAt/updatedAt are typed `Timestamp` (Date | string)
    // since Mongo can round-trip them as ISO strings; normalize to Date here.
    this.createdAt = new Date(vehicle.createdAt!);
    this.updatedAt = new Date(vehicle.updatedAt!);
  }

  static fromVehicle(vehicle: Vehicle): VehicleResponseDto {
    return new VehicleResponseDto(vehicle);
  }

  static fromVehicles(vehicles: Vehicle[]): VehicleResponseDto[] {
    return vehicles.map(v => new VehicleResponseDto(v));
  }
}