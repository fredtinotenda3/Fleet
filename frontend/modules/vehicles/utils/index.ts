
// frontend/modules/vehicles/utils/index.ts

import { VEHICLE_CONFIG } from '@/shared/config/constants';
import { getStatusConfig } from '@/shared/utils/status.utils';
import { getDaysUntil } from '@/shared/utils/date.utils';
import type { Vehicle } from '@/shared/types/vehicle.types';
import type { ExportFormat } from '@/shared/export/export.types';
import { triggerExport, type ExportDownloadResult } from '@/shared/utils/export-download.utils';
import { vehiclesApi } from '../services/vehicles.api';
import type { VehicleStatus, VehicleTableFilters } from '../types';
import { Permission, permissionService } from '@/server/permissions/roles';

export const VEHICLE_TYPE_OPTIONS = VEHICLE_CONFIG.vehicleTypes;
export const FUEL_TYPE_OPTIONS = VEHICLE_CONFIG.fuelTypes;

export function vehicleDisplayName(vehicle: Pick<Vehicle, 'year' | 'make' | 'model'>): string {
  return `${vehicle.year} ${vehicle.make} ${vehicle.model}`;
}

export function getVehicleStatusMeta(status: Vehicle['status']) {
  return getStatusConfig(status);
}

const STATUS_BADGE_CLASS: Record<VehicleStatus, string> = {
  active: 'badge-success',
  maintenance: 'badge-warning',
  inactive: 'badge-neutral',
};

export function getVehicleStatusBadgeClass(status: VehicleStatus): string {
  return STATUS_BADGE_CLASS[status] ?? 'badge-neutral';
}

export function isRegistrationExpiringSoon(date?: string, withinDays = 30): boolean {
  if (!date) return false;
  const days = getDaysUntil(date);
  return days >= 0 && days <= withinDays;
}

export function isRegistrationExpired(date?: string): boolean {
  if (!date) return false;
  return getDaysUntil(date) < 0;
}

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
export function canManageVehicles(roles: string[] = []): boolean {
  return permissionService.hasAnyPermission(roles, [
    Permission.VEHICLE_CREATE,
    Permission.VEHICLE_EDIT,
  ]);
}

export function canDeleteVehicles(roles: string[] = []): boolean {
  return permissionService.hasPermission(roles, Permission.VEHICLE_DELETE);
}

/**
 * Enterprise Export Framework (Phase 2).
 *
 * Replaces the old exportVehiclesToCSV(vehicles) / exportVehiclesToExcel(vehicles)
 * pair, which only ever received the currently-loaded PAGE of vehicles
 * (result?.data from VehiclesListPage) -- exporting "all vehicles" from a
 * filtered, paginated list silently exported only page 1.
 *
 * exportVehicles(filters, format) instead sends the user's current filters
 * to GET /api/vehicles/export, which re-runs the same scoped/filtered query
 * server-side with no page limit (capped at EXPORT_ROW_CAP) and returns a
 * real file. Tenant/org-unit scoping is enforced identically to the list
 * endpoint since both share vehicleRepository's scoped query builder.
 */
export async function exportVehicles(
  filters: VehicleTableFilters,
  format: ExportFormat = 'csv'
): Promise<ExportDownloadResult> {
  return triggerExport(
    () => vehiclesApi.exportFile(filters, format),
    `vehicles-export.${format}`
  );
}