/* eslint-disable @typescript-eslint/no-unused-vars */
// frontend/modules/trips/utils/index.ts

import { formatDistance } from '@/shared/utils/distance.utils';
import { formatDate } from '@/shared/utils/date.utils';
import type { ExportFormat } from '@/shared/export/export.types';
import { triggerExport, type ExportDownloadResult } from '@/shared/utils/export-download.utils';
import { tripsApi } from '../services/trips.api';
import type { Trip, TripTableFilters } from '../types';

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

const MANAGE_ROLES = ['organization_owner', 'fleet_manager', 'dispatcher', 'super_admin'];
const DELETE_ROLES = ['organization_owner', 'fleet_manager', 'super_admin'];

export function canManageTrips(roles: string[] = []): boolean {
  return roles.some((r) => MANAGE_ROLES.includes(r));
}

export function canDeleteTrips(roles: string[] = []): boolean {
  return roles.some((r) => DELETE_ROLES.includes(r));
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