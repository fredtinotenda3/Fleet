/* eslint-disable @typescript-eslint/no-unused-vars */
// frontend/modules/trips/utils/index.ts

import { generateCSV, downloadCSV } from '@/shared/utils/csv.utils';
import { formatDistance } from '@/shared/utils/distance.utils';
import { formatDate } from '@/shared/utils/date.utils';
import type { Trip } from '../types';

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

export function exportTripsToCSV(trips: Trip[]): void {
  const csv = generateCSV(trips, [
    { header: 'Date', accessor: (t) => formatDate(t.date) },
    { header: 'License Plate', accessor: (t) => t.license_plate },
    { header: 'Mode', accessor: (t) => tripModeLabel(t.mode) },
    { header: 'Distance (km)', accessor: (t) => t.distance_calculated },
    { header: 'Start Odometer', accessor: (t) => t.start_odometer },
    { header: 'End Odometer', accessor: (t) => t.end_odometer },
    { header: 'Start Location', accessor: (t) => t.start_location },
    { header: 'End Location', accessor: (t) => t.end_location },
    { header: 'Driver', accessor: (t) => t.driver_id },
    { header: 'Notes', accessor: (t) => t.notes },
  ]);
  downloadCSV(csv, `trips-export-${new Date().toISOString().slice(0, 10)}.csv`);
}

export async function exportTripsToExcel(trips: Trip[]): Promise<void> {
  const XLSX = await import('xlsx');
  const rows = trips.map((t) => ({
    Date: formatDate(t.date),
    'License Plate': t.license_plate,
    Mode: tripModeLabel(t.mode),
    'Distance (km)': t.distance_calculated,
    'Start Odometer': t.start_odometer ?? '',
    'End Odometer': t.end_odometer ?? '',
    'Start Location': t.start_location ?? '',
    'End Location': t.end_location ?? '',
    Driver: t.driver_id ?? '',
    Notes: t.notes ?? '',
  }));
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Trips');
  XLSX.writeFile(workbook, `trips-export-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function printTrips(): void {
  window.print();
}