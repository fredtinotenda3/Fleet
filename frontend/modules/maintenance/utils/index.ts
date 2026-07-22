// frontend/modules/maintenance/utils/index.ts

import { isOverdue as dateIsOverdue } from '@/shared/utils/date.utils';
import { formatCurrency } from '@/shared/utils/currency.utils';
import type { ExportFormat } from '@/shared/export/export.types';
import { triggerExport, type ExportDownloadResult } from '@/shared/utils/export-download.utils';
import { maintenanceApi } from '../services/maintenance.api';
import type { Reminder, ReminderStatus, Priority, MaintenanceTableFilters } from '../types';

export function canManageMaintenance(roles: string[]): boolean {
  return roles.some((r) =>
    ['super_admin', 'organization_owner', 'fleet_manager', 'mechanic'].includes(r)
  );
}

export function canDeleteMaintenance(roles: string[]): boolean {
  return roles.some((r) => ['super_admin', 'organization_owner', 'fleet_manager'].includes(r));
}

export function canCompleteMaintenance(roles: string[]): boolean {
  return roles.some((r) =>
    ['super_admin', 'organization_owner', 'fleet_manager', 'mechanic'].includes(r)
  );
}

export const STATUS_BADGE_CLASSES: Record<ReminderStatus, string> = {
  pending: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  overdue: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-800',
};

export const PRIORITY_BADGE_CLASSES: Record<Priority, string> = {
  low: 'bg-slate-100 text-slate-700',
  medium: 'bg-yellow-100 text-yellow-800',
  high: 'bg-orange-100 text-orange-800',
  critical: 'bg-red-100 text-red-800',
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

/**
 * Enterprise Export Framework (Phase 2). Replaces exportMaintenanceToCSV/
 * exportMaintenanceToExcel, which only ever exported the currently-loaded
 * page of records. Sends the user's current filters to
 * GET /api/reminders?action=export, which re-runs the same scoped/
 * filtered query server-side with no page limit (capped at
 * EXPORT_ROW_CAP) and returns a real file.
 */
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