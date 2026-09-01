// modules/telematics/services/reading-alerts.ts
//
// The single definition of "what, on one telematics reading, counts as
// an alert". Pure: no repository, no service, no I/O -- which is the
// whole point, because it now has TWO callers with very different
// lifecycles:
//
//   1. telematics.service.ts's ingestion path, which persists the
//      resulting TelematicsAlert rows and notifies fleet managers.
//   2. live-map.service.ts, which needs to colour a map marker red
//      WITHOUT a second database round-trip per vehicle.
//
// WHY THE LIVE MAP DOES NOT READ THE ALERT STORE. Two independent
// reasons, either of which is sufficient:
//
//   * N+1. The live map returns up to MAX_LIVE_MAP_VEHICLES (500)
//     vehicles per poll, every 10 seconds. getActiveAlertsInScope is
//     keyed by a single vehicleId, so using it would add 500 queries per
//     poll. There is no batched equivalent today.
//   * (HISTORICAL -- NOW FIXED) tbltelematics_alerts rows carried NO
//     orgUnitId. createAlert inserted
//     `{ vehicleId, ...alert, tenantId, createdAt, isDeleted }` and
//     nothing else, while getActiveAlertsInScope applies the standard
//     orgUnitId predicate -- so for any org-unit-scoped caller that
//     predicate matched zero rows. Fail-CLOSED, never a leak, but a
//     total loss of function for exactly the roles the live map is
//     scoped for.
//
//     BACKLOG ITEM 2 closed it: createAlert now REQUIRES a
//     `ResolvedAlertOwnership` (alert-ownership.resolver.ts) resolved
//     from the vehicle record, so rows written since carry their org
//     unit. Historical rows are corrected by
//     `npm run db:backfill-alert-orgunits`.
//
// The N+1 reason is unaffected and remains sufficient on its own: there
// is still no batched "which of these 500 vehicles is alerting" read, so
// the live map still derives from the reading. The closed finding is
// kept here rather than deleted, so a future reader neither re-opens it
// nor assumes the map avoids the alert store for a reason that no longer
// applies.
//
// Deriving from the reading also means that, by construction, the map
// agrees with the alert engine -- they run the same function over the
// same row.

import { TelematicsAlert, TelematicsData } from '../types/telematics.types';

/** Above this road speed (km/h) a reading raises a speeding alert. */
export const SPEEDING_THRESHOLD_KMH = 120;
/** Below this fuel PERCENTAGE a reading raises a low-fuel alert. */
export const LOW_FUEL_THRESHOLD_PERCENT = 10;

/** Ranked worst-last, so a numeric index can compare two severities. */
const SEVERITY_ORDER: readonly TelematicsAlert['severity'][] = ['low', 'medium', 'high', 'critical'];

/** The more serious of two severities. */
export function maxSeverity(
  a: TelematicsAlert['severity'],
  b: TelematicsAlert['severity']
): TelematicsAlert['severity'] {
  return SEVERITY_ORDER.indexOf(a) >= SEVERITY_ORDER.indexOf(b) ? a : b;
}

/**
 * Alerts implied by a single reading's own values.
 *
 * Extracted verbatim from TelematicsService.checkForAlerts -- behaviour
 * is unchanged and telematics.service.ts now delegates here, so the two
 * callers can never drift apart the way two copies of a threshold would.
 */
export function deriveReadingAlerts(
  data: Pick<TelematicsData, 'location' | 'engine' | 'timestamp'>
): TelematicsAlert[] {
  const alerts: TelematicsAlert[] = [];

  if (data.location && data.location.speed > SPEEDING_THRESHOLD_KMH) {
    alerts.push({
      type: 'speeding',
      severity: 'high',
      message: `Vehicle exceeding speed limit: ${data.location.speed} km/h`,
      value: data.location.speed,
      threshold: SPEEDING_THRESHOLD_KMH,
      timestamp: data.timestamp,
    });
  }

  if (data.engine?.dtcCodes && data.engine.dtcCodes.length > 0) {
    alerts.push({
      type: 'engine',
      severity: 'critical',
      message: `Engine fault codes detected: ${data.engine.dtcCodes.join(', ')}`,
      value: data.engine.dtcCodes.length,
      timestamp: data.timestamp,
    });
  }

  // `typeof === 'number'` rather than a truthiness or `!= null` check:
  // fuelLevel is optional (see TelematicsData.engine.fuelLevel), and a
  // reading from a device that does not report fuel must not raise a
  // "Low fuel level" alert. 0 is a legitimate reported value and still
  // alerts; absent does not.
  if (data.engine && typeof data.engine.fuelLevel === 'number' && data.engine.fuelLevel < LOW_FUEL_THRESHOLD_PERCENT) {
    alerts.push({
      type: 'maintenance',
      severity: 'high',
      message: `Low fuel level: ${data.engine.fuelLevel}%`,
      value: data.engine.fuelLevel,
      threshold: LOW_FUEL_THRESHOLD_PERCENT,
      timestamp: data.timestamp,
    });
  }

  return alerts;
}
