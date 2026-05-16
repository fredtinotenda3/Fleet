// shared/types/meter.types.ts

import { BaseEntity } from './common.types';
import type { Unit } from './unit.types';  // Import Unit from unit.types

export interface MeterLog extends BaseEntity {
  license_plate: string;
  odometer: number;
  date: Date;
  unit_id: string;
  unit?: Unit;
}

export interface MeterLogCreateDTO {
  license_plate: string;
  odometer: number;
  date: Date | string;
  unit_id: string;
}

export interface MeterLogUpdateDTO extends Partial<MeterLogCreateDTO> {
  _id: string;
}

export interface MeterFilters {
  license_plate?: string;
  unit_id?: string;
  startDate?: Date;
  endDate?: Date;
}

export interface MeterStats {
  totalLogs: number;
  totalOdometer: number;
  averageOdometer: number;
  uniqueVehicles: number;
  lastReadingDate: Date | null;
}