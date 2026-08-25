// modules/telematics/providers/canonical-telemetry.ts
//
// PHASE 2 -- the provider-neutral reading.
//
// ---------------------------------------------------------------------
// WHAT THIS IS, AND WHAT IT IS NOT
// ---------------------------------------------------------------------
// `TelematicsData` (telematics.types.ts) is the PERSISTENCE model: a
// Mongo document with `_id`, `createdAt`, `tenantId`, `orgUnitId`. It
// grew organically and carries no provider identity at all -- which is
// how provider became a string prefix on `deviceId`.
//
// `CanonicalTelemetryPoint` is the CONTRACT between an adapter and the
// ingestion pipeline. It is what a provider promises to produce, before
// anything is known about where it will be stored or who owns it.
//
// The distinction is deliberate and load-bearing:
//
//   * An adapter CANNOT set tenantId or orgUnitId. They are absent from
//     this type entirely. Ownership is resolved from the vehicle record
//     by the ingestion layer -- the Phase 0 rule, now enforced by the
//     type system rather than by everyone remembering. A compromised or
//     buggy adapter has no field in which to express a forged tenant.
//   * An adapter DOES set providerId and externalDeviceId, because only
//     it knows them.
//   * `vehicleId` is optional. An adapter that has not matched a device
//     to a vehicle says so by omitting it, rather than by guessing.
//
// ---------------------------------------------------------------------
// UNITS -- TAKEN FROM THE EXISTING CODEBASE, NOT INVENTED
// ---------------------------------------------------------------------
// Verified against the current models and adapters rather than chosen:
//
//   speed          km/h    (TelematicsLocation.speed; SPEEDING_THRESHOLD_KMH = 120)
//   heading        degrees 0-360 (TelematicsLocation.heading)
//   odometer       km      (Cartrack `odometer_km`; eagletrack-report-values
//                           converts miles -> km explicitly and REFUSES a
//                           bare `m` unit because metres-vs-miles is a
//                           1000x error on an odometer)
//   fuelLevel      percent 0-100 (telematics.schema.ts constrains the HTTP
//                           ingest payload to that range)
//   fuelUsed       litres
//   consumption    L/100km (`fuel.consumptionRate`) -- SEPARATE from
//                           instantConsumption in L/h (`fuel.instantConsumption`).
//                           Kept separate because conflating them is a
//                           real bug this codebase already had: Eagle
//                           Track io-199 is "Fuel Consumption, L/h" and
//                           was being written to the L/100km field.
//   engineHours    hours
//   batteryVoltage volts
//   coolantTemp    degrees Celsius
//   altitude       metres
//   accuracy       metres (horizontal, lower is better)
//
// An adapter whose provider reports a different unit MUST convert, and
// must refuse rather than guess when the unit is ambiguous -- the
// precedent is eagletrack-report-values.ts, which rejects `gal` (US vs
// imperial) and an ambiguous decimal comma.
//
// ---------------------------------------------------------------------
// ABSENT IS NOT ZERO
// ---------------------------------------------------------------------
// Every measurement is optional and MUST be omitted when the provider
// did not report it. This is the Phase 1 rule (F-2), restated here
// because the contract is where it can be enforced for providers that
// do not exist yet. See telematics.types.ts for the consequences: a
// fabricated `fuelLevel: 0` manufactures a high-severity low-fuel alert
// on every poll; a fabricated `odometer: 0` used to win over the
// vehicle's real odometer.

import { TelematicsProviderId } from './provider.types';

/** A position fix. Latitude/longitude are required; everything else is not. */
export interface CanonicalPosition {
  /** Decimal degrees, WGS84, -90..90. */
  latitude: number;
  /** Decimal degrees, WGS84, -180..180. */
  longitude: number;
  /** km/h. A genuine 0 (stationary) is a real value and must be preserved. */
  speed?: number;
  /**
   * Compass degrees 0-360.
   *
   * Optional and never defaulted: 0 is due north, so a substituted 0
   * points every non-reporting vehicle's arrow the same wrong way.
   */
  heading?: number;
  /** Metres above sea level. */
  altitude?: number;
  /** Horizontal accuracy in metres. Never 0 as a stand-in for unknown -- 0 reads as a perfect fix. */
  accuracy?: number;
}

/** Engine and drivetrain signals. */
export interface CanonicalEngine {
  /** true = ignition on. Tri-state via optionality: absent means unreported. */
  ignition?: boolean;
  rpm?: number;
  /** Degrees Celsius. */
  coolantTemp?: number;
  /** Percent 0-100. */
  fuelLevel?: number;
  /** Percent 0-100. */
  throttlePosition?: number;
  /** Percent 0-100. */
  engineLoad?: number;
  /** Hours. */
  engineHours?: number;
  /** Volts. */
  batteryVoltage?: number;
  /** Percent 0-100. */
  batteryLevel?: number;
  /** Provider diagnostic trouble codes, verbatim. */
  dtcCodes?: string[];
}

/** Cumulative and trip-level distance/fuel figures. */
export interface CanonicalTrip {
  /** Cumulative vehicle odometer in KM. */
  odometer?: number;
  /** Distance for the current trip, km. */
  tripDistance?: number;
  /** Duration for the current trip, minutes. */
  tripDuration?: number;
  /**
   * Trip aggregates. Only set when the provider genuinely aggregates.
   * An adapter must NOT map an instantaneous speed here -- both current
   * adapters' live endpoints are point-in-time fixes with no trip
   * aggregation, and doing so reported a trip maximum of 0 for a vehicle
   * sampled while stationary.
   */
  averageSpeed?: number;
  maxSpeed?: number;
  /** Minutes idled. Must be a DURATION, never a boolean-as-number. */
  idleTime?: number;
}

/** Fuel-flow signals. */
export interface CanonicalFuel {
  /** L/100km. */
  consumptionRate?: number;
  /** L/h. Distinct from consumptionRate -- see the units note above. */
  instantConsumption?: number;
  /** Litres. */
  fuelUsed?: number;
}

/** A provider-raised event, translated to platform vocabulary. */
export interface CanonicalEvent {
  /**
   * Platform event type. Adapters map the vendor's own taxonomy onto
   * this; anything with no faithful equivalent maps to 'vendor' rather
   * than being forced into a near-miss. The precedent is Eagle Track
   * trigger type 4 (Stop), deliberately NOT mapped to 'idle' because
   * idle means engine-running-while-stationary everywhere in this
   * codebase, and misfiling it would have inflated the idle metric with
   * parked vehicles.
   */
  type: 'speeding' | 'geofence' | 'harsh_braking' | 'harsh_acceleration' | 'idle' | 'vendor';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  occurredAt: Date;
  /** The vendor's own identifier for this event, for dedupe on re-sync. */
  providerEventId?: string;
  value?: number;
  threshold?: number;
}

/**
 * One reading from one provider, in platform terms.
 *
 * Note what is ABSENT: tenantId, orgUnitId, _id, createdAt. Those are
 * ownership and storage concerns resolved downstream from the vehicle
 * record. See the header for why that is enforced by omission.
 */
export interface CanonicalTelemetryPoint {
  /** Which provider produced this. Never inferred from a device id. */
  providerId: TelematicsProviderId;
  /**
   * The PROVIDER'S own identifier for the device -- Eagle Track's `uin`,
   * Cartrack's `terminal_serial`. Verbatim, unprefixed, unparsed.
   */
  externalDeviceId: string;
  /**
   * Our vehicle's Mongo _id, when the adapter has matched one.
   *
   * Optional on purpose: an adapter that cannot match a device to a
   * vehicle omits this and the ingestion layer reports it as unmatched,
   * rather than the adapter guessing. Guessing which internal vehicle a
   * stray registration belongs to is the class of guess this codebase
   * consistently refuses to make.
   */
  vehicleId?: string;

  /**
   * The PROVIDER'S timestamp for this fix, normalised to a JS Date (UTC
   * internally).
   *
   * Must never be filled in with server time when the provider gave
   * none. `lastFixAt` (provider clock) and `lastPingAt` (our wall clock)
   * are separated on TelematicsDevice precisely because comparing them
   * produced an incident where readings were skipped as "stale"
   * essentially permanently.
   */
  recordedAt: Date;

  position?: CanonicalPosition;
  engine?: CanonicalEngine;
  trip?: CanonicalTrip;
  fuel?: CanonicalFuel;
  events?: CanonicalEvent[];

  /**
   * Provider-specific extras, opaque to the fleet layer.
   *
   * Preserved so a vendor's raw signals are not lost at ingest, but
   * NOTHING in generic fleet code may branch on its contents -- doing so
   * re-creates the coupling Phase 2 removes, just one level deeper. The
   * `Record<string, unknown>` type is the enforcement: a consumer cannot
   * read a field from it without an explicit, visible cast.
   */
  providerMetadata?: Record<string, unknown>;
}

// ─── Normalisation helpers ────────────────────────────────────────────
//
// Shared so that every adapter -- including ones written later -- makes
// the same decisions, rather than each re-deriving them. Each returns
// `undefined` for "not reported" and never substitutes a zero.

/**
 * Parses a provider timestamp into a Date.
 *
 * Accepts an ISO-8601 string, a Date, or an epoch value in SECONDS or
 * MILLISECONDS (disambiguated by magnitude -- a seconds-epoch for any
 * plausible date is < 1e11, a ms-epoch is > 1e11).
 *
 * Returns undefined for anything unparseable, including the empty
 * string, so a caller must decide what to do rather than silently
 * receiving the Unix epoch. `new Date('')` is Invalid Date and
 * `new Date(0)` is 1970 -- both would have flowed straight into a
 * `timestamp: -1` index and sorted as the oldest reading in the fleet.
 *
 * A bare-string timestamp with no zone designator is interpreted as UTC
 * rather than server-local, because a provider's server timezone is not
 * ours and reading it as local time silently shifts every fix by the
 * deployment's offset. Providers that report local time must convert in
 * their own adapter, where the offset is known.
 */
export function normaliseTimestamp(raw: unknown): Date | undefined {
  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? undefined : raw;
  }

  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const ms = Math.abs(raw) < 1e11 ? raw * 1000 : raw;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }

  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return undefined;

    // `2026-08-20 09:15:00` (space separator, no zone) is a common
    // provider format that Date parses as LOCAL time. Normalise it to an
    // explicit UTC ISO string first.
    const bare = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(:\d{2})?)$/.exec(trimmed);
    const candidate = bare ? `${bare[1]}T${bare[2]}Z` : trimmed;

    const d = new Date(candidate);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }

  return undefined;
}

/**
 * A finite number, or undefined.
 *
 * The single guard every adapter should use before putting a value on a
 * canonical point. Rejects NaN and Infinity -- `Number('7.14 km')` is
 * NaN, which is exactly how "every distance read as not reported" was
 * introduced once already.
 */
export function normaliseNumber(raw: unknown): number | undefined {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : undefined;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return undefined;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

/** A number constrained to a range, or undefined if out of range. */
export function normaliseBounded(
  raw: unknown,
  min: number,
  max: number
): number | undefined {
  const n = normaliseNumber(raw);
  if (n === undefined) return undefined;
  return n >= min && n <= max ? n : undefined;
}

/**
 * Compass heading, normalised into 0-360.
 *
 * Wraps rather than rejecting: 370 degrees is unambiguously 10, and a
 * provider emitting -90 means 270. Out-of-range headings are a common
 * provider quirk and there is no ambiguity in the correction, unlike a
 * unit mismatch.
 */
export function normaliseHeading(raw: unknown): number | undefined {
  const n = normaliseNumber(raw);
  if (n === undefined) return undefined;
  return ((n % 360) + 360) % 360;
}

/**
 * Ignition state as a tri-state.
 *
 * Accepts booleans, 0/1, and the common string spellings. Anything else
 * returns undefined rather than false -- "ignition off" and "this device
 * does not report ignition" are different facts, and the second must not
 * masquerade as the first (idle time is derived from ignition-on-while-
 * stationary, so a false would make every non-reporting vehicle
 * permanently not-idling).
 */
export function normaliseIgnition(raw: unknown): boolean | undefined {
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'number') {
    if (raw === 1) return true;
    if (raw === 0) return false;
    return undefined;
  }
  if (typeof raw === 'string') {
    const v = raw.trim().toLowerCase();
    if (['true', '1', 'on', 'yes'].includes(v)) return true;
    if (['false', '0', 'off', 'no'].includes(v)) return false;
  }
  return undefined;
}

/** Miles to kilometres. Exact factor; used where a provider reports imperial. */
export function milesToKm(miles: number): number {
  return miles * 1.609344;
}

/**
 * Drops undefined members, returning undefined if nothing survives.
 *
 * Lets an adapter build a container optimistically and have "the
 * provider reported none of these" collapse to an absent container
 * rather than an empty object that looks like a real reading of nothing.
 */
export function compact<T extends Record<string, unknown>>(obj: T): T | undefined {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null) out[k] = v;
  }
  return Object.keys(out).length > 0 ? (out as T) : undefined;
}
