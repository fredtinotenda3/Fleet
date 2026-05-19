// shared/types/trip.types.ts

import { BaseEntity, Mode } from './common.types';

export interface Trip extends BaseEntity {
  license_plate: string;
  distance_calculated: number;
  mode: Mode;
  date: Date;
  notes?: string;
  unit_id: string;
  trip_distance?: number;
  start_odometer?: number;
  end_odometer?: number;
  start_location?: string;
  end_location?: string;
  driver_id?: string;
}

export interface TripCreateDTO {
  license_plate: string;
  mode: Mode;
  date: Date | string;
  unit_id: string;
  notes?: string;
  trip_distance?: number;
  start_odometer?: number;
  end_odometer?: number;
  start_location?: string;
  end_location?: string;
  driver_id?: string;
}

export interface TripUpdateDTO extends Partial<TripCreateDTO> {
  _id: string;
}

export interface TripFilters {
  license_plate?: string;
  startDate?: Date;
  endDate?: Date;
  mode?: Mode;
  driver_id?: string;
}

export interface TripStats {
  totalDistance: number;
  totalTrips: number;
  averageDistance: number;
  byVehicle: Record<string, number>;
  byDriver: Record<string, number>;
}