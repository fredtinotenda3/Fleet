// modules/dispatch/types/dispatch.types.ts
import { BaseEntity, Priority } from '@/shared/types/common.types';

export type DispatchJobStatus = 'unassigned' | 'assigned' | 'en_route' | 'in_progress' | 'completed' | 'cancelled';

export interface DispatchJob extends BaseEntity {
  title: string;
  priority: Priority;
  status: DispatchJobStatus;
  pickupLocation: string;
  dropoffLocation?: string;
  scheduledFor?: Date;
  assignedDriverId?: string;
  assignedVehicleId?: string;
  assignedAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
  cancelledReason?: string;
  notes?: string;
}

export interface DispatchJobCreateDTO {
  title: string;
  priority?: Priority;
  pickupLocation: string;
  dropoffLocation?: string;
  scheduledFor?: Date | string;
  notes?: string;
}

export interface DispatchFilters {
  status?: DispatchJobStatus;
  priority?: Priority;
  assignedDriverId?: string;
  assignedVehicleId?: string;
}