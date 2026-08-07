/* eslint-disable @typescript-eslint/no-unused-vars */
// frontend/modules/trips/utils/index.ts

import { formatDistance } from '@/shared/utils/distance.utils';
import { formatDate } from '@/shared/utils/date.utils';
import type { ExportFormat } from '@/shared/export/export.types';
import { triggerExport, type ExportDownloadResult } from '@/shared/utils/export-download.utils';
import { tripsApi } from '../services/trips.api';
import type { Trip, TripTableFilters } from '../types';
import { Permission, permissionService } from '@/server/permissions/roles';

export function tripModeLabel(mode: Trip['mode']): string {
  return mode === 'distance' ? 'Direct distance' : 'Odometer reading';
}

export function getTripModeBadgeClass(mode: Trip['mode']): string {
  return mode === 'distance' ? 'badge-info' : 'badge-neutral';
}

export function tripSummaryLabel(trip: Trip): string {
  if (trip.start_location && trip.end_location) {
    return `${trip.start_location} → ${trip.end_location}`;
  }
  return trip.start_location || trip.end_location || 'No route recorded';
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


export function canManageTrips(roles: string[] = []): boolean {
  return permissionService.hasAnyPermission(roles, [
    Permission.TRIP_CREATE,
    Permission.TRIP_EDIT,
  ]);
}

export function canDeleteTrips(roles: string[] = []): boolean {
  return permissionService.hasPermission(roles, Permission.TRIP_DELETE);
}

/**
 * Enterprise Export Framework (Phase 2). Replaces exportTripsToCSV/
 * exportTripsToExcel, which only ever exported the currently-loaded page
 * of trips. Sends the user's current filters to GET /api/trips/export,
 * which re-runs the same scoped/filtered query server-side with no page
 * limit (capped at EXPORT_ROW_CAP) and returns a real file.
 */
export async function exportTrips(
  filters: TripTableFilters,
  format: ExportFormat = 'csv'
): Promise<ExportDownloadResult> {
  return triggerExport(
    () => tripsApi.exportFile(filters, format),
    `trips-export.${format}`
  );
}

export function printTrips(): void {
  window.print();
}