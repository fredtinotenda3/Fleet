// modules/workshop/types/workshop.types.ts
import { BaseEntity } from '@/shared/types/common.types';

export type BayStatus = 'available' | 'occupied' | 'maintenance' | 'closed';

export interface WorkshopBay extends BaseEntity {
  name: string;
  bayNumber: string;
  status: BayStatus;
  capabilities: string[]; // e.g. ["brakes", "electrical", "tires"]
  currentWorkOrderId?: string;
  currentMechanicIds: string[];
}

export interface WorkshopBayCreateDTO {
  name: string;
  bayNumber: string;
  capabilities?: string[];
}

export type WorkshopBayUpdateDTO = Partial<WorkshopBayCreateDTO> & { status?: BayStatus };

export interface MechanicAssignment extends BaseEntity {
  mechanicId: string;
  bayId?: string;
  workOrderId?: string;
  assignedAt: Date;
  releasedAt?: Date;
}