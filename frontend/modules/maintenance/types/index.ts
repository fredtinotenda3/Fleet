// frontend/modules/maintenance/types/index.ts

import type {
  Reminder,
  ReminderStatus,
  ReminderCreateDTO,
  ReminderUpdateDTO,
  MaintenanceFilters,
  MaintenanceStats,
} from '@/shared/types/maintenance.types';
import type { PaginationParams, PaginatedResponse, Priority } from '@/shared/types/common.types';

export type {
  Reminder,
  ReminderStatus,
  ReminderCreateDTO,
  ReminderUpdateDTO,
  MaintenanceFilters,
  MaintenanceStats,
  PaginationParams,
  PaginatedResponse,
  Priority,
};

/** UI alias -- backend entity is `Reminder`; UI domain language is "maintenance record". */
export type MaintenanceRecord = Reminder;

export interface MaintenanceTableFilters extends MaintenanceFilters {}

export const MAINTENANCE_CATEGORIES = [
  'preventive',
  'corrective',
  'emergency',
  'scheduled_service',
  'inspection',
  'tires',
  'oil_change',
  'brakes',
  'battery',
  'engine',
  'transmission',
  'electrical',
] as const;

export type MaintenanceCategory = (typeof MAINTENANCE_CATEGORIES)[number];

export const MAINTENANCE_CATEGORY_LABELS: Record<MaintenanceCategory, string> = {
  preventive: 'Preventive Maintenance',
  corrective: 'Corrective Maintenance',
  emergency: 'Emergency Repair',
  scheduled_service: 'Scheduled Service',
  inspection: 'Inspection',
  tires: 'Tire Service',
  oil_change: 'Oil Change',
  brakes: 'Brake Service',
  battery: 'Battery Replacement',
  engine: 'Engine Repair',
  transmission: 'Transmission Repair',
  electrical: 'Electrical Repair',
};

export const RECURRENCE_PRESETS = [
  { value: '30d', label: 'Every 30 days' },
  { value: '90d', label: 'Every 90 days' },
  { value: '6m', label: 'Every 6 months' },
  { value: '1y', label: 'Every year' },
] as const;

export interface MaintenanceColumnVisibility {
  license_plate: boolean;
  category: boolean;
  priority: boolean;
  status: boolean;
  due_date: boolean;
  assigned_to: boolean;
  estimated_cost: boolean;
  notes: boolean;
}

export const DEFAULT_MAINTENANCE_COLUMN_VISIBILITY: MaintenanceColumnVisibility = {
  license_plate: true,
  category: true,
  priority: true,
  status: true,
  due_date: true,
  assigned_to: false,
  estimated_cost: true,
  notes: false,
};

export interface MaintenanceStatusBreakdown {
  status: ReminderStatus;
  count: number;
}

export interface MaintenanceCategoryBreakdown {
  category: string;
  count: number;
  totalEstimatedCost: number;
}