// shared/types/maintenance.types.ts

import { BaseEntity, Priority } from './common.types';

export type ReminderStatus = 'pending' | 'completed' | 'overdue' | 'cancelled';

export interface Reminder extends BaseEntity {
  license_plate: string;
  title: string;
  due_date: Date;
  notes?: string;
  status: ReminderStatus;
  completion_date?: Date;
  priority?: Priority;
  service_type?: string;
  recurrence_interval?: string; // Format: "30d", "3m", "1y"
  next_due_date?: Date;
  next_due_odometer?: number;
  assigned_to?: string;
}

export interface ReminderCreateDTO {
  license_plate: string;
  title: string;
  due_date: Date | string;
  notes?: string;
  priority?: Priority;
  service_type?: string;
  recurrence_interval?: string;
  assigned_to?: string;
}

export interface ReminderUpdateDTO extends Partial<ReminderCreateDTO> {
  _id: string;
  status?: ReminderStatus;
  completion_date?: Date;
}

export interface MaintenanceFilters {
  license_plate?: string;
  status?: ReminderStatus;
  priority?: Priority;
  startDate?: Date;
  endDate?: Date;
  assigned_to?: string;
}

export interface MaintenanceStats {
  total: number;
  completed: number;
  pending: number;
  overdue: number;
  completionRate: number;
  averageCompletionDays: number;
}