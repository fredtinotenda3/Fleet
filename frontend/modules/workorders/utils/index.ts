// frontend/modules/workorders/utils/index.ts

import { Permission, permissionService } from '@/server/permissions/roles';
import { formatCurrency } from '@/shared/utils/currency.utils';
import type { WorkOrder, WorkOrderStatus, Priority } from '../types';
import { WORK_ORDER_VALID_TRANSITIONS } from '../types';

export function canCreateWorkOrders(roles: string[]): boolean {
  return permissionService.hasPermission(roles, Permission.WORKORDER_CREATE);
}

export function canAssignWorkOrders(roles: string[]): boolean {
  return permissionService.hasPermission(roles, Permission.WORKORDER_ASSIGN);
}

/** Status transitions other than assign (start, hold, complete, cancel) require WORKORDER_MANAGE. */
export function canManageWorkOrders(roles: string[]): boolean {
  return permissionService.hasPermission(roles, Permission.WORKORDER_MANAGE);
}

/** A mechanic can mark their own work as complete without full manage rights. */
export function canCompleteWorkOrders(roles: string[]): boolean {
  return permissionService.hasAnyPermission(roles, [Permission.WORKORDER_COMPLETE, Permission.WORKORDER_MANAGE]);
}

export const WORK_ORDER_STATUS_BADGE_CLASSES: Record<WorkOrderStatus, string> = {
  open: 'bg-info-bg text-info',
  assigned: 'bg-warning-bg text-warning',
  in_progress: 'bg-warning-bg text-warning border border-warning/50',
  on_hold: 'bg-muted text-muted-foreground',
  completed: 'bg-success-bg text-success',
  cancelled: 'bg-muted text-muted-foreground',
};

export const PRIORITY_BADGE_CLASSES: Record<Priority, string> = {
  low: 'bg-muted text-muted-foreground',
  medium: 'bg-warning-bg text-warning',
  high: 'bg-warning-bg text-warning border border-warning/50',
  critical: 'bg-danger-bg text-danger',
};

export function getPriorityLabel(priority?: Priority): string {
  if (!priority) return 'Medium';
  return priority.charAt(0).toUpperCase() + priority.slice(1);
}

export function formatWorkOrderCost(cost?: number): string {
  if (cost === undefined || cost === null) return '—';
  return formatCurrency(cost);
}

/** Next statuses reachable from this work order's current status, per the backend's VALID_TRANSITIONS. */
export function getNextStatuses(status: WorkOrderStatus): WorkOrderStatus[] {
  return WORK_ORDER_VALID_TRANSITIONS[status];
}

export function isWorkOrderClosed(workOrder: WorkOrder): boolean {
  return workOrder.status === 'completed' || workOrder.status === 'cancelled';
}