// modules/vehicles/dto/update-vehicle.dto.ts

import { VehicleUpdateInput } from '@/shared/validations/vehicle.schema';

export class UpdateVehicleDto {
  _id: string;
  license_plate?: string;
  make?: string;
  model?: string;
  year?: number;
  vehicle_type?: string;
  purchase_date?: string;
  fuel_type?: string;
  color?: string;
  vin?: string;
  status?: 'active' | 'inactive' | 'maintenance';
  registration_expiry?: string;
  insurance_provider?: string;
  service_interval?: number;
  odometer?: number;

  constructor(data: VehicleUpdateInput) {
    this._id = data._id;
    this.license_plate = data.license_plate?.toUpperCase();
    this.make = data.make;
    this.model = data.model;
    this.year = data.year;
    this.vehicle_type = data.vehicle_type;
    this.purchase_date = data.purchase_date;
    this.fuel_type = data.fuel_type;
    this.color = data.color ?? undefined;
    this.vin = data.vin ?? undefined;
    this.status = data.status;
    this.registration_expiry = data.registration_expiry ?? undefined;
    this.insurance_provider = data.insurance_provider ?? undefined;
    this.service_interval = data.service_interval ?? undefined;
    this.odometer = data.odometer ?? undefined;
  }
}