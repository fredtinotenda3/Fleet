// shared/utils/status.utils.ts

import { Status, Priority } from '../types/common.types';

export const STATUS_CONFIG = {
  active: { label: 'Active', color: 'bg-green-100 text-green-800', variant: 'default' },
  inactive: { label: 'Inactive', color: 'bg-gray-100 text-gray-800', variant: 'secondary' },
  maintenance: { label: 'Maintenance', color: 'bg-yellow-100 text-yellow-800', variant: 'destructive' },
  archived: { label: 'Archived', color: 'bg-red-100 text-red-800', variant: 'destructive' },
} as const;

export const PRIORITY_CONFIG = {
  low: { label: 'Low', color: 'bg-blue-100 text-blue-800', order: 0 },
  medium: { label: 'Medium', color: 'bg-yellow-100 text-yellow-800', order: 1 },
  high: { label: 'High', color: 'bg-orange-100 text-orange-800', order: 2 },
  critical: { label: 'Critical', color: 'bg-red-100 text-red-800', order: 3 },
} as const;

export const REMINDER_STATUS_CONFIG = {
  pending: { label: 'Pending', color: 'bg-yellow-100 text-yellow-800' },
  completed: { label: 'Completed', color: 'bg-green-100 text-green-800' },
  overdue: { label: 'Overdue', color: 'bg-red-100 text-red-800' },
  cancelled: { label: 'Cancelled', color: 'bg-gray-100 text-gray-800' },
} as const;

export function getStatusConfig(status: Status) {
  return STATUS_CONFIG[status] || STATUS_CONFIG.inactive;
}

export function getPriorityConfig(priority: Priority) {
  return PRIORITY_CONFIG[priority] || PRIORITY_CONFIG.medium;
}

export function getReminderStatusConfig(status: keyof typeof REMINDER_STATUS_CONFIG) {
  return REMINDER_STATUS_CONFIG[status] || REMINDER_STATUS_CONFIG.pending;
}

export function getStatusBadgeClasses(status: string): string {
  const config = STATUS_CONFIG[status as Status];
  return config?.color || 'bg-gray-100 text-gray-800';
}

export function sortByPriority(a: Priority, b: Priority): number {
  return PRIORITY_CONFIG[a].order - PRIORITY_CONFIG[b].order;
}