// shared/types/fuel.types.ts

import { BaseEntity } from './common.types';

export interface FuelLog extends BaseEntity {
  license_plate: string;
  date: Date;
  fuel_volume: number;
  unit_id: string;
  cost: number;
  odometer?: number;
  station_name?: string;
  fuel_type?: string;
  unit?: {
    name: string;
    symbol: string;
    unit_id: string;
  };
}

export interface FuelLogCreateDTO {
  license_plate: string;
  date: Date | string;
  fuel_volume: number;
  unit_id: string;
  cost: number;
  odometer?: number;
  station_name?: string;
  fuel_type?: string;
}

export interface FuelLogUpdateDTO extends Partial<FuelLogCreateDTO> {
  _id: string;
}

export interface FuelFilters {
  license_plate?: string;
  unit_id?: string;
  startDate?: Date;
  endDate?: Date;
}

export interface FuelStats {
  totalFuel: number;
  totalCost: number;
  averageCostPerUnit: number;
  logCount: number;
  efficiency: number | null;
}