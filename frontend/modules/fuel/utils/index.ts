// frontend/modules/fuel/utils/index.ts

import type { ExportFormat } from '@/shared/export/export.types';
import { triggerExport, type ExportDownloadResult } from '@/shared/utils/export-download.utils';
import { fuelApi } from '../services/fuel.api';
import type { FuelTableFilters } from '../types';
import { Permission, permissionService } from '@/server/permissions/roles';

/**
 * BUTTON-VISIBILITY FIX.
 *
 * These used to be hardcoded role allowlists. Every one of them omitted
 * BRANCH_MANAGER, DEPARTMENT_MANAGER, WORKSHOP_MANAGER and
 * ORGANIZATION_ADMIN -- so harare.manager@ and bulawayo.manager@ saw no
 * "Add"/"Edit"/"Delete" controls anywhere, despite roles.ts granting them
 * VEHICLE_CREATE, VEHICLE_EDIT, FUEL_CREATE, EXPENSE_CREATE and the rest.
 *
 * A duplicated allowlist in the frontend cannot help but drift from
 * server/permissions/roles.ts, and when it drifts in this direction the
 * user simply cannot do their job; when it drifts the other way they get
 * a button that 403s. Delegating to permissionService means the button
 * and the endpoint that backs it read the SAME permission table.
 *
 * Scope is enforced separately and server-side: a user with no scope
 * assignment sees no rows, and unassigned@ (viewer) holds none of these
 * permissions, so no buttons render for them either.
 */
export function canManageFuel(roles: string[]): boolean {
  return permissionService.hasAnyPermission(roles, [
    Permission.FUEL_CREATE,
    Permission.FUEL_EDIT,
  ]);
}

export function canDeleteFuel(roles: string[]): boolean {
  return permissionService.hasPermission(roles, Permission.FUEL_DELETE);
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