// modules/workorders/types/workorder.types.ts
import { BaseEntity, Priority } from '@/shared/types/common.types';

export type WorkOrderStatus = 'open' | 'assigned' | 'in_progress' | 'on_hold' | 'completed' | 'cancelled';

export interface WorkOrderPartUsage {
  sparePartId: string;
  quantity: number;
}

export interface WorkOrder extends BaseEntity {
  license_plate: string;
  title: string;
  description?: string;
  status: WorkOrderStatus;
  priority: Priority;
  reminderId?: string; // links back to a maintenance reminder if triggered from one
  bayId?: string;
  assignedMechanicId?: string;
  partsUsed: WorkOrderPartUsage[];
  laborHours?: number;
  laborCost?: number;
  partsCost: number;
  totalCost: number;
  openedAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  cancelledReason?: string;
}

export interface WorkOrderCreateDTO {
  license_plate: string;
  title: string;
  description?: string;
  priority?: Priority;
  reminderId?: string;
}

export interface WorkOrderFilters {
  license_plate?: string;
  status?: WorkOrderStatus;
  priority?: Priority;
  assignedMechanicId?: string;
}