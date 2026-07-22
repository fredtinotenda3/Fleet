// frontend/modules/fuel/utils/index.ts

import type { ExportFormat } from '@/shared/export/export.types';
import { triggerExport, type ExportDownloadResult } from '@/shared/utils/export-download.utils';
import { fuelApi } from '../services/fuel.api';
import type { FuelTableFilters } from '../types';

export function canManageFuel(roles: string[]): boolean {
  return roles.some((r) => ['super_admin', 'organization_owner', 'fleet_manager', 'accountant'].includes(r));
}

export function canDeleteFuel(roles: string[]): boolean {
  return roles.some((r) => ['super_admin', 'organization_owner', 'fleet_manager'].includes(r));
}

export function canViewFuel(roles: string[]): boolean {
  return roles.some((r) =>
    ['super_admin', 'organization_owner', 'fleet_manager', 'accountant', 'auditor', 'viewer'].includes(r)
  );
}

/**
 * Enterprise Export Framework (Phase 2).
 *
 * Replaces exportFuelLogsToCSV/exportFuelLogsToExcel, which only ever
 * exported the currently-loaded page of fuel logs (and whose "Excel"
 * export silently fell back to CSV -- there was no xlsx generator wired
 * up for this module). exportFuelLogs(filters, format) sends the user's
 * current filters to GET /api/fuellogs?action=export, which re-runs the
 * same scoped/filtered query server-side with no page limit (capped at
 * EXPORT_ROW_CAP) and returns a real CSV or genuine .xlsx file.
 */
export async function exportFuelLogs(
  filters: FuelTableFilters,
  format: ExportFormat = 'csv'
): Promise<ExportDownloadResult> {
  return triggerExport(
    () => fuelApi.exportFile(filters, format),
    `fuel-logs-export.${format}`
  );
}

export function printFuelLogs(): void {
  window.print();
}