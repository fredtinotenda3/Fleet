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