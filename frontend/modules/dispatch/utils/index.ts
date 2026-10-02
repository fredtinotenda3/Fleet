// frontend/modules/dispatch/utils/index.ts

import { Permission, permissionService } from '@/server/permissions/roles';
import { formatCurrency } from '@/shared/utils/currency.utils';
import type { DispatchJob, DispatchJobStatus, Priority } from '../types';
import { DISPATCH_VALID_TRANSITIONS } from '../types';

export function canCreateDispatch(roles: string[]): boolean {
  return permissionService.hasPermission(roles, Permission.DISPATCH_CREATE);
}

export function canAssignDispatch(roles: string[]): boolean {
  return permissionService.hasPermission(roles, Permission.DISPATCH_ASSIGN);
}

/** Status transitions other than assignment (start, complete, cancel) and trip linking require DISPATCH_MANAGE. */
export function canManageDispatch(roles: string[]): boolean {
  return permissionService.hasPermission(roles, Permission.DISPATCH_MANAGE);
}

export const DISPATCH_STATUS_BADGE_CLASSES: Record<DispatchJobStatus, string> = {
  unassigned: 'bg-muted text-muted-foreground',
  assigned: 'bg-info-bg text-info',
  en_route: 'bg-warning-bg text-warning',
  in_progress: 'bg-warning-bg text-warning border border-warning/50',
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

export function formatDispatchCost(cost?: number): string {
  if (cost === undefined || cost === null) return '—';
  return formatCurrency(cost);
}

/** Next statuses reachable from this dispatch job's current status, per the backend's VALID_TRANSITIONS. */
export function getNextStatuses(status: DispatchJobStatus): DispatchJobStatus[] {
  return DISPATCH_VALID_TRANSITIONS[status];
}

export function isDispatchJobClosed(job: DispatchJob): boolean {
  return job.status === 'completed' || job.status === 'cancelled';
}

/**
 * Whether a trip may be linked to this job right now -- mirrors
 * TRIP_LINKABLE_STATUSES in modules/dispatch/services/dispatch.service.ts
 * exactly (assigned/en_route/in_progress; not unassigned -- no
 * vehicle/driver yet -- and not completed/cancelled -- already closed).
 * Used to show or hide the "Link trip" action without the request
 * round-tripping to a 409 first.
 */
export function canLinkTrip(job: DispatchJob): boolean {
  return !job.tripId && ['assigned', 'en_route', 'in_progress'].includes(job.status);
}
