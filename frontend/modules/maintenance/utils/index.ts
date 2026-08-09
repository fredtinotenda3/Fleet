// frontend/modules/maintenance/utils/index.ts

import { isOverdue as dateIsOverdue } from '@/shared/utils/date.utils';
import { formatCurrency } from '@/shared/utils/currency.utils';
import type { ExportFormat } from '@/shared/export/export.types';
import { triggerExport, type ExportDownloadResult } from '@/shared/utils/export-download.utils';
import { maintenanceApi } from '../services/maintenance.api';
import type { Reminder, ReminderStatus, Priority, MaintenanceTableFilters } from '../types';
import { Permission, permissionService } from '@/server/permissions/roles';

/**
 * FIX (Phase E, task 2): these three functions each did
 * `roles.some((r) => [...hardcoded strings].includes(r))`. Checked
 * every list against the real rolePermissions map in
 * server/permissions/roles.ts and found two real drifts, not just a
 * style issue:
 *
 * - canManageMaintenance/canCompleteMaintenance's role lists omitted
 *   BRANCH_MANAGER and WORKSHOP_MANAGER even though both hold
 *   MAINTENANCE_EDIT and MAINTENANCE_COMPLETE respectively -- Phase A
 *   added those roles after this file was last touched, so this is
 *   the same "list wasn't updated when a new role was added" bug
 *   already fixed in middleware.ts and Sidebar.tsx.
 * - canDeleteMaintenance's list included FLEET_MANAGER, but
 *   FLEET_MANAGER does NOT hold Permission.MAINTENANCE_DELETE in
 *   rolePermissions (only SUPER_ADMIN/ORGANIZATION_OWNER/
 *   ORGANIZATION_ADMIN do). This is a real access-model change, not
 *   cosmetic: a Fleet Manager who could previously delete maintenance
 *   records here now can't, matching what rolePermissions has always
 *   said. Flagging this explicitly rather than burying it -- if
 *   product wants Fleet Manager to retain delete rights, the fix is
 *   to add MAINTENANCE_DELETE to rolePermissions[FLEET_MANAGER] in
 *   roles.ts (the single source of truth), not to special-case it
 *   here again.
 */
export function canManageMaintenance(roles: string[]): boolean {
  return permissionService.hasPermission(roles, Permission.MAINTENANCE_EDIT);
}

export function canDeleteMaintenance(roles: string[]): boolean {
  return permissionService.hasPermission(roles, Permission.MAINTENANCE_DELETE);
}

export function canCompleteMaintenance(roles: string[]): boolean {
  return permissionService.hasPermission(roles, Permission.MAINTENANCE_COMPLETE);
}

export const STATUS_BADGE_CLASSES: Record<ReminderStatus, string> = {
  pending: 'bg-info-bg text-info',
  completed: 'bg-success-bg text-success',
  overdue: 'bg-danger-bg text-danger',
  cancelled: 'bg-muted text-muted-foreground',
};

export const PRIORITY_BADGE_CLASSES: Record<Priority, string> = {
  low: 'bg-muted text-muted-foreground',
  medium: 'bg-warning-bg text-warning',
  high: 'bg-warning-bg text-warning border border-warning/50',
  critical: 'bg-danger-bg text-danger',
};

export function getStatusLabel(status: ReminderStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function getPriorityLabel(priority?: Priority): string {
  if (!priority) return 'Medium';
  return priority.charAt(0).toUpperCase() + priority.slice(1);
}

export function isRecordOverdue(record: Reminder): boolean {
  if (record.status === 'completed' || record.status === 'cancelled') return false;
  return record.status === 'overdue' || dateIsOverdue(record.due_date);
}

export function formatEstimatedCost(cost?: number): string {
  if (cost === undefined || cost === null) return '—';
  return formatCurrency(cost);
}

export async function exportMaintenance(
  filters: MaintenanceTableFilters,
  format: ExportFormat = 'csv'
): Promise<ExportDownloadResult> {
  return triggerExport(
    () => maintenanceApi.exportFile(filters, format),
    `maintenance-records-export.${format}`
  );
}

export function printMaintenanceRecords(): void {
  window.print();
}