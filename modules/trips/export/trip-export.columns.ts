// modules/trips/export/trip-export.columns.ts
//
// Column definitions for the Trips export. Mirrors the fields already
// used by the pre-Phase-2 client-side exportTripsToCSV/exportTripsToExcel
// in frontend/modules/trips/utils/index.ts.
//
// Deliberately uses plain field access rather than the frontend's
// formatDistance/formatDate helpers (those live under frontend/shared
// and format for on-screen display, e.g. locale-aware date strings) --
// exports use raw ISO dates and numeric values so the file stays
// machine-parseable (re-importable, chartable in Excel) rather than
// display-formatted text.
//
// PHASE 1: appended status/timing/type columns after the original set
// rather than interleaving them, so a spreadsheet someone already built
// against the old column order doesn't have its column indexes shift.

import type { ExportColumn } from '@/shared/export';
import type { Trip } from '@/shared/types/trip.types';

function tripModeLabel(mode: Trip['mode']): string {
  return mode === 'distance' ? 'Direct distance' : 'Odometer reading';
}

export const TRIP_EXPORT_COLUMNS: ExportColumn<Trip>[] = [
  { header: 'Date', accessor: (t) => new Date(t.date).toISOString().slice(0, 10) },
  { header: 'License Plate', accessor: (t) => t.license_plate },
  { header: 'Mode', accessor: (t) => tripModeLabel(t.mode) },
  { header: 'Distance (km)', accessor: (t) => t.distance_calculated },
  { header: 'Start Odometer', accessor: (t) => t.start_odometer ?? '' },
  { header: 'End Odometer', accessor: (t) => t.end_odometer ?? '' },
  { header: 'Start Location', accessor: (t) => t.start_location ?? '' },
  { header: 'End Location', accessor: (t) => t.end_location ?? '' },
  { header: 'Driver', accessor: (t) => t.driver_id ?? '' },
  { header: 'Notes', accessor: (t) => t.notes ?? '' },
  // --- PHASE 1 additions ---
  { header: 'Status', accessor: (t) => t.status ?? '' },
  { header: 'Trip Type', accessor: (t) => t.trip_type ?? '' },
  { header: 'Start Time', accessor: (t) => (t.start_time ? new Date(t.start_time).toISOString() : '') },
  { header: 'End Time', accessor: (t) => (t.end_time ? new Date(t.end_time).toISOString() : '') },
  { header: 'Duration (min)', accessor: (t) => t.duration_minutes ?? '' },
  { header: 'Avg Speed (km/h)', accessor: (t) => (t.average_speed != null ? Number(t.average_speed.toFixed(1)) : '') },
  { header: 'Route', accessor: (t) => t.routeId ?? '' },
];

export const TRIP_EXPORT_SHEET_NAME = 'Trips';
export const TRIP_EXPORT_BASE_FILENAME = 'trips-export';
