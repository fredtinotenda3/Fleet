// modules/scheduling/types/scheduling.types.ts
import { BaseEntity } from '@/shared/types/common.types';

export type ShiftStatus = 'scheduled' | 'active' | 'completed' | 'cancelled';

export interface DriverShift extends BaseEntity {
  driverId: string;
  vehicleId?: string;
  startTime: Date;
  endTime: Date;
  status: ShiftStatus;
  notes?: string;
}

export interface DriverShiftCreateDTO {
  driverId: string;
  vehicleId?: string;
  startTime: Date | string;
  endTime: Date | string;
  notes?: string;
}

export interface DriverShiftFilters {
  driverId?: string;
  vehicleId?: string;
  status?: ShiftStatus;
  startDate?: Date;
  endDate?: Date;
}