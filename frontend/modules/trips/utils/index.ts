/* eslint-disable @typescript-eslint/no-unused-vars */
// frontend/modules/trips/utils/index.ts

import { formatDistance } from '@/shared/utils/distance.utils';
import { formatDate } from '@/shared/utils/date.utils';
import type { ExportFormat } from '@/shared/export/export.types';
import { triggerExport, type ExportDownloadResult } from '@/shared/utils/export-download.utils';
import { tripsApi } from '../services/trips.api';
import type { Trip, TripTableFilters, DistanceMeasurement } from '../types';
import { Permission, permissionService } from '@/server/permissions/roles';
import type { EvidenceTone } from '@/frontend/shared/ui/evidence/EvidencePopover';

const TRIP_MODE_LABELS: Record<Trip['mode'], string> = {
  distance: 'Direct distance',
  odometer: 'Odometer reading',
  map: 'Map-assisted',
};

export function tripModeLabel(mode: Trip['mode']): string {
  return TRIP_MODE_LABELS[mode] ?? 'Direct distance';
}

const TRIP_MODE_BADGE_CLASSES: Record<Trip['mode'], string> = {
  distance: 'badge-info',
  odometer: 'badge-neutral',
  map: 'badge-info',
};

export function getTripModeBadgeClass(mode: Trip['mode']): string {
  return TRIP_MODE_BADGE_CLASSES[mode] ?? 'badge-neutral';
}

/**
 * PART 5/9: a short, human label for the distance source actually
 * SELECTED for a trip -- what the Trip Detail page and the trips table
 * show next to the distance figure so a reader never mistakes a
 * map-derived number for an observed one.
 */
export function distanceSourceLabel(source: Trip['distance_source']): string {
  switch (source) {
    case 'gps-path':
      return 'GPS-observed';
    case 'odometer':
      return 'Odometer-derived';
    case 'map-derived':
      return 'Map-derived';
    case 'manual':
      return 'Manually reported';
    default:
      return 'Unavailable';
  }
}

/**
 * NOTE: `Trip['distance_source']` (widened in trip.generation-addendum.ts)
 * is `'odometer' | 'gps-path' | 'map-derived' | 'manual' | null` --
 * deliberately NARROWER than the standalone `DistanceSource` type in
 * evidence.types.ts, which also has `'unavailable'`. A trip never
 * stores the literal string 'unavailable' on this field; "no distance
 * source" is represented by the field being absent/null, not by that
 * extra literal. Keep these two in sync by hand if either changes.
 */
type RecordedDistanceSource = NonNullable<Trip['distance_source']>;

const DISTANCE_SOURCE_TONE: Record<RecordedDistanceSource, EvidenceTone> = {
  'gps-path': 'fact',
  odometer: 'calculated',
  'map-derived': 'calculated',
  manual: 'estimated',
};

export interface DistanceEvidenceSummary {
  sourceLabel: string;
  sourceTone: EvidenceTone;
  method?: string;
  calculatedAt?: string | Date;
  reference?: string;
  reason?: string;
}

/**
 * PART 5/9: turns a trip's `distance_source` + `distance_evidence` into
 * the props EvidencePopover needs, so the Trip Detail page (and anywhere
 * else a trip's distance is shown) can answer "how was this calculated"
 * without duplicating the source→evidence-key mapping.
 *
 * Returns undefined when there is nothing to show a popover for -- the
 * trip predates this evidence model, or has no recorded distance
 * source at all. That "unavailable" case is an honest absence, not a
 * value to format, so it belongs in inline text (see the Telematics
 * row's "Not recorded"/"No telematics connected" handling), not behind
 * a popover with nothing in it.
 */
export function buildDistanceEvidence(trip: Trip): DistanceEvidenceSummary | undefined {
  const source = trip.distance_source;
  if (!source) return undefined;

  const evidenceKey: Record<RecordedDistanceSource, keyof NonNullable<Trip['distance_evidence']>> = {
    'gps-path': 'gps',
    odometer: 'odometer',
    'map-derived': 'mapDerived',
    manual: 'manual',
  };

  const measurement: DistanceMeasurement | undefined =
    trip.distance_evidence?.[evidenceKey[source]];

  return {
    sourceLabel: distanceSourceLabel(source),
    sourceTone: DISTANCE_SOURCE_TONE[source] ?? 'calculated',
    method: measurement?.method,
    calculatedAt: measurement?.calculatedAt,
    reference: measurement?.reference,
    reason:
      source === 'manual'
        ? 'Manually reported: no odometer reading, GPS track, or map route backs this figure.'
        : undefined,
  };
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