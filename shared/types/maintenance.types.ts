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
  category?: string;
  recurrence_interval?: string;
  next_due_date?: Date;
  next_due_odometer?: number;
  assigned_to?: string;
  estimated_cost?: number;
  /** Inherited from the referenced vehicle's orgUnitId at write time -- see
   *  CreateReminderHandler/UpdateReminderHandler. Not user-submitted. */
  orgUnitId?: string;
}

export interface ReminderCreateDTO {
  license_plate: string;
  title: string;
  due_date: Date | string;
  notes?: string;
  priority?: Priority;
  service_type?: string;
  category?: string;
  recurrence_interval?: string;
  assigned_to?: string;
  estimated_cost?: number;
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
  category?: string;
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

// ---------------------------------------------------------------------
// Enterprise analytics additions (Maintenance Analytics Enhancement)
// ---------------------------------------------------------------------

/** Monthly completed-maintenance cost trend. Cost figure is `estimated_cost`
 *  summed across completed records in that month -- there is currently no
 *  separate "actual cost" field on Reminder (see audit notes), so this is
 *  the best available cost signal, not a true actuals ledger. */
export interface MaintenanceCostTrendPoint {
  month: string; // YYYY-MM
  totalCost: number;
  count: number;
}

/** How often a vehicle needs maintenance -- ranked by completed-record count. */
export interface RepairFrequencyByVehicleRow {
  license_plate: string;
  count: number;
  totalCost: number;
}

/** Vehicles with the highest cumulative estimated maintenance cost. */
export interface MostExpensiveVehicleRow {
  license_plate: string;
  totalCost: number;
  recordCount: number;
}

/** Approximate downtime per vehicle: average number of days between a
 *  record's due_date and its completion_date. This is a PROXY, not a
 *  measured out-of-service duration -- there is no start/end
 *  out-of-service timestamp on Reminder today. A negative average (fixed
 *  early) is floored to 0. */
export interface DowntimeEstimatePoint {
  license_plate: string;
  estimatedDowntimeDays: number;
  recordCount: number;
}