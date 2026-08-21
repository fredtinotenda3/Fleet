// modules/telematics/adapters/eagletrack/eagletrack-triggers.map.ts
//
// Eagle Track's `/api2/triggers` objects, and how their seven documented
// types relate to the two things this product already has: Geofence rows
// and TelematicsAlert rows.
//
// ---------------------------------------------------------------------
// THE SEVEN TYPES ARE NOT SEVEN GEOFENCES
// ---------------------------------------------------------------------
// The vendor calls all of these "triggers", and the temptation is to
// treat the whole list as a geofence import. Only three of them describe
// a PLACE:
//
//     0  Geo-fence    -> a boundary. A geofence.
//     1  Speed Alert  -> a speed threshold. Not a place.
//     2  Area         -> a boundary. A geofence.
//     3  Idle Alert   -> a duration threshold. Not a place.
//     4  Stop Alert   -> a duration threshold. Not a place.
//     5  Route Alert  -> a corridor. A geofence of type 'route'.
//     6  Custom Alert -> vendor-defined. Unknown by construction.
//
// Creating a Geofence row for types 1/3/4/6 would mean inventing
// coordinates for an object that has none, and every one of those
// fabricated boundaries would then be evaluated on every location ping
// by telematics.service.ts's checkGeofence -- firing entry/exit alerts
// for a shape that does not exist. So the non-spatial types are recorded
// as provider triggers and nothing more.
//
// Even for 0/2/5 a Geofence is only created when the payload actually
// yields parseable geometry. A "Geo-fence" trigger whose coordinates we
// cannot read is recorded with `geofenceSkippedReason: 'no-geometry'`
// rather than being given a default centre and radius.
//
// ---------------------------------------------------------------------
// ALERT TYPE MAPPING, AND THE TWO THAT DO NOT MAP
// ---------------------------------------------------------------------
// TelematicsAlert['type'] is our own vocabulary, and five of the seven
// have an exact counterpart in it. Two do not:
//
//   * 4 Stop Alert is NOT 'idle'. Idle, everywhere else in this codebase
//     (see the adapter's `ignitionOn && speed === 0` derivation), means
//     ENGINE RUNNING while stationary. A stop is stationary with no
//     claim about the engine. Filing stops as idle time would inflate
//     the idle metric with parked vehicles and, once the finance module
//     posts telemetry-driven costs, attribute idle fuel burn to vehicles
//     that were switched off.
//   * 6 Custom Alert is vendor-defined free text. There is no honest
//     canonical bucket for "whatever this operator configured".
//
// Both get the 'vendor' member added to the union in this pass. The
// alternative -- dropping them -- loses real events the provider sent,
// which the brief explicitly rules out in the other direction too ("do
// not invent events that the provider does not send" cuts both ways).
// 'vendor' was safe to add: nothing in the codebase switches
// exhaustively on TelematicsAlert['type'], and the only consumer that
// reads it at all interpolates it into a notification title.

import { TelematicsAlert, Geofence } from '../../types/telematics.types';

/** The vendor's documented trigger type codes. */
export const EAGLETRACK_TRIGGER_TYPE = {
  GEOFENCE: 0,
  SPEED_ALERT: 1,
  AREA: 2,
  IDLE_ALERT: 3,
  STOP_ALERT: 4,
  ROUTE_ALERT: 5,
  CUSTOM_ALERT: 6,
} as const;

export type EagleTrackTriggerTypeCode =
  (typeof EAGLETRACK_TRIGGER_TYPE)[keyof typeof EAGLETRACK_TRIGGER_TYPE];

/**
 * One row per documented type. Kept as data, in one table, so the three
 * questions asked of a trigger -- what is it called, is it a place, what
 * does it become in our alert vocabulary -- are answered in one place
 * and cannot drift apart across three switch statements.
 */
export interface EagleTrackTriggerTypeDescriptor {
  code: EagleTrackTriggerTypeCode;
  /** The vendor's own label, verbatim. Not our interpretation. */
  label: string;
  /**
   * The Geofence shape this type describes, or null when the type has no
   * geometry at all. Non-null does NOT mean a geofence will be created
   * -- the payload must also yield readable coordinates.
   */
  geofenceType: Geofence['type'] | null;
  /** Our canonical alert vocabulary. See the header for 4 and 6. */
  alertType: TelematicsAlert['type'];
}

export const EAGLETRACK_TRIGGER_TYPES: Readonly<
  Record<EagleTrackTriggerTypeCode, EagleTrackTriggerTypeDescriptor>
> = {
  [EAGLETRACK_TRIGGER_TYPE.GEOFENCE]: {
    code: EAGLETRACK_TRIGGER_TYPE.GEOFENCE,
    label: 'Geo-fence',
    geofenceType: 'polygon',
    alertType: 'geofence',
  },
  [EAGLETRACK_TRIGGER_TYPE.SPEED_ALERT]: {
    code: EAGLETRACK_TRIGGER_TYPE.SPEED_ALERT,
    label: 'Speed Alert',
    geofenceType: null,
    alertType: 'speeding',
  },
  [EAGLETRACK_TRIGGER_TYPE.AREA]: {
    code: EAGLETRACK_TRIGGER_TYPE.AREA,
    label: 'Area',
    geofenceType: 'polygon',
    alertType: 'geofence',
  },
  [EAGLETRACK_TRIGGER_TYPE.IDLE_ALERT]: {
    code: EAGLETRACK_TRIGGER_TYPE.IDLE_ALERT,
    label: 'Idle Alert',
    geofenceType: null,
    alertType: 'idle',
  },
  [EAGLETRACK_TRIGGER_TYPE.STOP_ALERT]: {
    code: EAGLETRACK_TRIGGER_TYPE.STOP_ALERT,
    label: 'Stop Alert',
    geofenceType: null,
    // NOT 'idle' -- see the header. A stop makes no claim about the engine.
    alertType: 'vendor',
  },
  [EAGLETRACK_TRIGGER_TYPE.ROUTE_ALERT]: {
    code: EAGLETRACK_TRIGGER_TYPE.ROUTE_ALERT,
    label: 'Route Alert',
    geofenceType: 'route',
    alertType: 'geofence',
  },
  [EAGLETRACK_TRIGGER_TYPE.CUSTOM_ALERT]: {
    code: EAGLETRACK_TRIGGER_TYPE.CUSTOM_ALERT,
    label: 'Custom Alert',
    geofenceType: null,
    alertType: 'vendor',
  },
};

/**
 * Descriptor for a raw type value, or null when the vendor sent a code
 * outside the documented range.
 *
 * Null rather than a default descriptor, deliberately: an undocumented
 * type 7 appearing in a future firmware must show up as "we do not know
 * what this is" (recorded raw, no geofence, no canonical alert) rather
 * than silently inheriting Geo-fence's behaviour and manufacturing a
 * boundary.
 */
export function describeTriggerType(raw: unknown): EagleTrackTriggerTypeDescriptor | null {
  const code = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isInteger(code)) return null;
  return (
    EAGLETRACK_TRIGGER_TYPES[code as EagleTrackTriggerTypeCode] ?? null
  );
}

/**
 * Severity for a vendor alert of a given trigger type.
 *
 * Speeding is 'high' to match what deriveReadingAlerts already assigns
 * to our own speeding rule -- two systems disagreeing about the severity
 * of the same event is worse than either verdict. Everything else is
 * 'medium': the provider does not send a severity, and inventing
 * 'critical' for an idle alert would push a fleet-manager notification
 * (see processAlerts) for a parked truck.
 */
export function triggerSeverity(
  descriptor: EagleTrackTriggerTypeDescriptor | null
): TelematicsAlert['severity'] {
  if (descriptor?.code === EAGLETRACK_TRIGGER_TYPE.SPEED_ALERT) return 'high';
  return 'medium';
}
