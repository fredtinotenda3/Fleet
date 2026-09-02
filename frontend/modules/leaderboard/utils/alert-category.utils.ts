// frontend/modules/leaderboard/utils/alert-category.utils.ts
//
// The seven alert-category tiles, and the pure builder that turns
// already-fetched data into their view models. No React, no fetch --
// same testability convention as ./leaderboard.utils.ts.
//
// ─────────────────────────────────────────────────────────────────────
// WHY THREE OF THE SEVEN TILES SHIP DISABLED
//
// TelematicsAlert (modules/telematics/types/telematics.types.ts) has
// exactly the categories this feature asks for -- 'speeding',
// 'hard_brake', 'geofence', and low fuel (filed under 'maintenance' by
// reading-alerts.ts) -- and those rows are persisted in
// tbltelematics_alerts. But the ONLY read path into that collection is
// telematicsRepository.getActiveAlertsInScope(vehicleId, context),
// exposed as GET /api/telematics/vehicles/{vehicleId}/alerts. It is
// keyed by a single vehicle. There is no grouped, counted or batched
// read, and reading-alerts.ts's own header says so explicitly while
// explaining why the live map derives alerts from the latest reading
// instead ("there is still no batched 'which of these 500 vehicles is
// alerting' read").
//
// So a fleet-wide count of geofence alerts would mean one request per
// vehicle. For a 500-vehicle fleet that is 500 requests to render one
// tile. That is not a UI decision to make quietly; it is a missing
// endpoint. See docs/leaderboard/BACKEND_AGGREGATION_GAPS.md for the
// contract that would fill these three tiles.
//
// WHAT WAS DELIBERATELY NOT DONE INSTEAD:
//
//   * Counting LiveMapVehicle.alert.reasons from GET /api/telematics/
//     live-map. `reasons` is a deduplicated list of human-readable
//     alert MESSAGES ("Low fuel level: 8%"), not types -- categorising
//     it means substring-matching prose that exists to be read by a
//     person, and any wording change silently zeroes the tile. It also
//     counts VEHICLES CURRENTLY IN A STATE, not alert events over a
//     period, so it would not answer the question the tile asks.
//
//   * Showing 0 for the three unbacked tiles. A zero and an
//     unanswerable question look identical on a tile and mean opposite
//     things. "No geofence breaches this week" is a reassuring, false
//     statement to put in front of a fleet manager.
// ─────────────────────────────────────────────────────────────────────

import type {
  AlertCategoryDefinition,
  AlertCategoryId,
  AlertCategoryInputs,
  AlertCategoryTileModel,
} from '../types';

/**
 * The catalogue. Order is the render order: the four telematics/safety
 * categories first, then the three financial/planning ones, so the two
 * disabled tiles sit next to the two supported tiles from the same
 * domain rather than being hidden at the end where nobody reads the
 * explanation.
 */
export const ALERT_CATEGORY_DEFINITIONS: readonly AlertCategoryDefinition[] = [
  {
    id: 'overspeed',
    label: 'Overspeed',
    description: 'Speeding events across all scored drivers.',
    availability: 'supported',
    sourceLabel: 'GET /api/ai/dashboard → driverRisk[].metrics.speedingEvents',
    href: '/drivers/scorecard',
    format: 'count',
  },
  {
    id: 'harsh_braking',
    label: 'Harsh braking',
    description: 'Hard-braking events across all scored drivers.',
    availability: 'supported',
    sourceLabel: 'GET /api/ai/dashboard → driverRisk[].metrics.hardBrakes',
    href: '/drivers/scorecard',
    format: 'count',
  },
  {
    id: 'geofence',
    label: 'Geofence',
    description: 'Geofence entry/exit breaches across the fleet.',
    availability: 'unsupported',
    sourceLabel: 'No fleet-wide read exists',
    missingEndpoint: 'GET /api/telematics/alerts/summary',
    format: 'count',
  },
  {
    id: 'low_fuel',
    label: 'Low fuel',
    description: 'Vehicles reporting fuel below the low-fuel threshold.',
    availability: 'unsupported',
    sourceLabel: 'No fleet-wide read exists',
    missingEndpoint: 'GET /api/telematics/alerts/summary',
    format: 'count',
  },
  {
    id: 'maintenance_due',
    label: 'Maintenance due',
    description: 'Unresolved reminders already past their due date.',
    availability: 'supported',
    sourceLabel: 'GET /api/reminders?action=stats → overdue',
    href: '/maintenance/overdue',
    format: 'count',
  },
  {
    id: 'fuel_fraud',
    label: 'Fuel fraud',
    description: 'Vehicles with an open fuel-fraud finding.',
    availability: 'supported',
    sourceLabel: 'GET /api/ai/dashboard → fuelFraud findings',
    href: '/needs-attention',
    format: 'count',
  },
  {
    id: 'expense_anomaly',
    label: 'Expense anomalies',
    description: 'Expenses flagged as anomalous against the fleet baseline.',
    availability: 'supported',
    sourceLabel: 'GET /api/ai/dashboard → expenseAnomalies findings',
    href: '/needs-attention',
    format: 'count',
  },
] as const;

/** Lookup by id. Returns undefined for an unknown id rather than throwing. */
export function alertCategoryDefinition(id: AlertCategoryId): AlertCategoryDefinition | undefined {
  return ALERT_CATEGORY_DEFINITIONS.find((definition) => definition.id === id);
}

/** The message shown on a tile that has no endpoint behind it. */
export function unsupportedReason(definition: AlertCategoryDefinition): string {
  return definition.missingEndpoint
    ? `No aggregation endpoint. Needs ${definition.missingEndpoint}.`
    : 'No aggregation endpoint available.';
}

/**
 * Resolves one supported tile's count against its source's status.
 *
 * The ordering matters: an 'unsupported' definition can never become
 * 'ready' no matter what a caller passes as `value`, and a source that
 * is still loading or has errored yields null rather than the caller's
 * value. A caller that passes a stale number alongside status 'error'
 * gets an error tile, not a number presented as current.
 */
function resolveTile(
  definition: AlertCategoryDefinition,
  value: number | null,
  status: 'loading' | 'error' | 'ready'
): AlertCategoryTileModel {
  if (definition.availability === 'unsupported') {
    return {
      ...definition,
      count: null,
      state: 'unsupported',
      unavailableReason: unsupportedReason(definition),
    };
  }

  if (status === 'loading') {
    return { ...definition, count: null, state: 'loading' };
  }

  if (status === 'error') {
    return {
      ...definition,
      count: null,
      state: 'error',
      unavailableReason: 'Source unavailable.',
    };
  }

  if (value === null || !Number.isFinite(value)) {
    // The query succeeded but the panel it feeds came back null --
    // getAIDashboard() maps a failed AI service to null rather than
    // failing the response, so "ready with a null panel" is a real,
    // common state and is NOT zero.
    return {
      ...definition,
      count: null,
      state: 'error',
      unavailableReason: 'This source returned no result.',
    };
  }

  return { ...definition, count: value, state: 'ready' };
}

/**
 * Builds all seven tiles from already-fetched data.
 *
 * Pure: every input is passed in, nothing is read from a hook or the
 * network, so the whole tile matrix -- including every not-ready
 * combination -- is unit testable.
 */
export function buildAlertCategoryTiles(inputs: AlertCategoryInputs): AlertCategoryTileModel[] {
  const { aiStatus, maintenanceStatus } = inputs;

  return ALERT_CATEGORY_DEFINITIONS.map((definition) => {
    switch (definition.id) {
      case 'overspeed':
        return resolveTile(definition, inputs.driverRisk?.speedingEvents ?? null, aiStatus);
      case 'harsh_braking':
        return resolveTile(definition, inputs.driverRisk?.hardBrakes ?? null, aiStatus);
      case 'fuel_fraud':
        return resolveTile(definition, inputs.fuelFraudCount, aiStatus);
      case 'expense_anomaly':
        return resolveTile(definition, inputs.expenseAnomalyCount, aiStatus);
      case 'maintenance_due':
        return resolveTile(definition, inputs.maintenanceOverdue, maintenanceStatus);
      // 'geofence' and 'low_fuel' are unsupported; resolveTile short-
      // circuits on availability, so the value passed here is never
      // read. Passing null anyway keeps that fact obvious at the call
      // site rather than resting on a branch three functions away.
      default:
        return resolveTile(definition, null, aiStatus);
    }
  });
}

/**
 * Secondary line for the maintenance tile: how many reminders are
 * scheduled but not yet due.
 *
 * Deliberately NOT added into the tile's own count. MaintenanceStats
 * splits unresolved reminders into `overdue` (due_date < now) and
 * `pending` (due_date >= now, with no upper bound), so summing them
 * would count a service booked for next year as "due" and inflate the
 * tile against the Maintenance page's own overdue figure.
 */
export function scheduledMaintenanceCaption(scheduled: number | null): string | undefined {
  if (scheduled === null || !Number.isFinite(scheduled)) return undefined;
  return scheduled === 1 ? '1 more scheduled ahead' : `${scheduled} more scheduled ahead`;
}

/** How many of the seven tiles currently have a real number behind them. */
export function countReadyTiles(tiles: readonly AlertCategoryTileModel[]): number {
  return tiles.filter((tile) => tile.state === 'ready').length;
}
