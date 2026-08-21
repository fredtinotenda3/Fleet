// modules/telematics/adapters/eagletrack/eagletrack.adapter.ts
//
// The bridge between Eagle Track's api2 wire format and our own
// telematics pipeline. Like cartrack.adapter.ts it deliberately does NOT
// write to tbltelematics directly -- every matched reading goes through
// telematicsService.ingestTelematicsData, the same path the generic
// ingest endpoint uses, so Eagle Track readings get the identical
// speeding/fuel/DTC alerting, geofence entry/exit evaluation and
// fleet-manager notifications as every other source, with no duplicated
// logic here.
//
// ---------------------------------------------------------------------
// VEHICLE MATCHING -- READ THIS BEFORE CHANGING IT
// ---------------------------------------------------------------------
// Cartrack matches on `registration`, a first-class field that Cartrack
// guarantees. Eagle Track has no single field that plays that role, so
// matching walks an ordered list of candidates. Production testing
// against a live deployment is what determined both the list and the
// order:
//
//   * `plate` -- first-class, PRESENT on the live roster, and empty on
//     every row of it. First in the order anyway: when a deployment does
//     populate it, it is the field the vendor's own UI calls the plate,
//     so it is the most authoritative thing on offer.
//   * `__platenumber` -- the documented vendor CUSTOM field, and ABSENT
//     from the live roster entirely. This adapter was originally written
//     to match on it exclusively, which on the live deployment matched
//     nothing at all. Kept second for deployments that do populate it;
//     never depended on.
//   * `name` -- free text, and where the plate actually lives in
//     practice ("ADY2531", "AFU0078"). Also legitimately holds
//     non-plates ("DashCam2") and plates buried in prose ("PT201B abc
//     long long title name").
//
// The rule:
//
//   0. FIRST, consult the explicit admin-managed uin -> vehicle link
//      (tbltelematics_eagletrack_links). An operator who has said "this
//      tracker is that vehicle" outranks every heuristic below, and no
//      vendor free text can override it. Recorded as matchedBy 'link'.
//      This is the fix the RESIDUAL AMBIGUITY note below has always
//      called for; the fallbacks are kept for trackers nobody has
//      linked yet.
//   1. Collect the candidates above, in that order, skipping any that
//      is absent, non-string, or blank after trimming. Duplicates are
//      collapsed (two fields holding the same plate is one lookup).
//   2. Try each against vehicleRepository.findByLicensePlate(value,
//      tenantId) -- an EXACT, tenant-scoped equality match. First
//      candidate that resolves to a vehicle wins, and which field it
//      was is recorded (result.matchedBy, and the device's metadata).
//   3. No candidate resolves -> NO MATCH. The tracker is returned in
//      `unmatchedTrackers`. Never dropped silently, never auto-created
//      as a vehicle.
//
// MATCHING ON `name` IS NOT FUZZY MATCHING, and the distinction is the
// whole safety argument. There is no similarity scoring, no substring
// search, no plate-shaped regex, and no normalisation beyond trimming
// whitespace and the case-folding findByLicensePlate already applies
// (this codebase stores license_plate upper-cased, so case folding is
// canonicalisation, not guessing). "PT201B abc long long title name"
// does not match a vehicle plated PT201B -- it is not equal to it. The
// authority on what counts as a plate is the tenant's own vehicle table,
// never a heuristic in this file. That is deliberate: a regex here would
// have to encode the plate format of every jurisdiction we ever sell
// into, and would silently drop the ones it got wrong.
//
// WHY FIRST-MATCH-WINS RATHER THAN FIRST-FIELD-WINS: a stale or junk
// `plate` value would otherwise permanently mask a perfectly good
// `name`, and the vendor's plate-ish fields are documented junk
// carriers. Falling through costs at most two extra indexed lookups per
// tracker per poll and cannot widen what matches, because every
// candidate must still equal a real plate in this tenant.
//
// WHY NOT LOOSER STILL: a wrong match is worse than no match. A
// misattributed reading writes another vehicle's GPS trace, odometer and
// fuel level into this vehicle's history, fires its geofence and
// speeding alerts, and -- once the finance module posts telemetry-driven
// costs -- attributes distance to the wrong cost centre. That is
// unwindable only by hand. The same discipline
// server/utils/tenant-context.utils.ts applies to org-unit resolution
// (refuse to guess an owner) applies here.
//
// RESIDUAL AMBIGUITY, and what now resolves it: if `plate` and `name`
// hold the plates of two DIFFERENT vehicles, the heuristic order above
// resolves it deterministically to `plate` and nothing flags the
// conflict. That is why step 0 exists. The admin mapping screen
// (/telematics/trackers) lists every uin the last sync could not place
// -- `unmatchedTrackers`, which is why it was reported rather than
// logged and forgotten -- next to a vehicle picker, and a link made
// there takes precedence over all three heuristics. The matchedBy
// counters remain the signal for how much of a fleet still stands on
// vendor free text: a fully-linked account reports everything under
// `link`.
//
// ---------------------------------------------------------------------
// WHAT THIS ADAPTER COVERS, AND WHAT LIVES ELSEWHERE
// ---------------------------------------------------------------------
// `last` (status polling) and `trackers` (roster/matching) remain this
// file's own responsibility. The rest of api2 is implemented in
// dedicated services, because each has a different cadence, a different
// failure mode and a different scoping story:
//
//   * GET /api2/history        -> eagletrack-history.service.ts
//   * GET /api2/reports/fuel   -> eagletrack-fuel.service.ts
//   * GET /api2/drivers        -> eagletrack-driver-sync.service.ts
//   * GET /api2/triggers       -> eagletrack-trigger-sync.service.ts
//   * history?alertfilter=...  -> eagletrack-alert-sync.service.ts
//
// syncOrganization drives the driver and trigger sub-syncs (they are
// roster-shaped, so they belong with the roster poll) on their own,
// slower cadence -- see SUB_SYNC_INTERVAL_MS. History, fuel and alerts
// are pulled on demand by the endpoints that need them: backfilling
// every vehicle's full history on a position poll would be an unbounded
// amount of work triggered by somebody opening a map.
//
// Vendor-side alerts on the LIVE snapshot (`alert.cmd` /
// `alert.trigger`) are still recorded verbatim in the reading's provider
// metadata and still not reconciled here -- the reconciliation now
// happens against the vendor's own alert FEED, which carries trigger ids
// and timestamps that a two-integer snapshot flag does not.
//
// ---------------------------------------------------------------------
// ORG-UNIT SCOPE IS NOW CARRIED ON EVERY READING
// ---------------------------------------------------------------------
// The mapped payload previously had no `orgUnitId`, and nothing
// downstream added one, while telematicsRepository.scopeOf() applies a
// bare `{ orgUnitId: { $in: [...] } }` with no "or unassigned" branch
// (unlike geofences, which deliberately have one). The consequence was
// that every branch/department-scoped user saw ZERO Eagle Track vehicles
// on the live map -- fail-closed, so never a leak, but it made the
// feature invisible to exactly the roles it was built for.
//
// matchVehicle already loads the vehicle, so the unit now travels with
// the match at no extra query cost. This can only narrow or preserve
// visibility, never widen it: an org-wide caller resolves to `{}` and is
// unaffected, and a scoped caller goes from seeing nothing to seeing
// their own units. A vehicle with no orgUnitId of its own still produces
// readings with none, which stay invisible to scoped callers -- that is
// the fail-closed default the tenancy layer is built on, and the fix for
// it is assigning the vehicle, not loosening the predicate.

import { vehicleRepository } from '@/modules/vehicles/repositories/vehicle.repository';
import { monitoring } from '@/infrastructure/monitoring/logger';
import { telematicsService } from '../../services/telematics.service';
import { telematicsRepository } from '../../repositories/telematics.repository';
import { eagletrackConfigRepository } from '../../repositories/eagletrack-config.repository';
import { eagletrackTrackerLinkRepository } from '../../repositories/eagletrack-tracker-link.repository';
import { eagletrackDriverSyncService } from '../../services/eagletrack-driver-sync.service';
import { eagletrackTriggerSyncService } from '../../services/eagletrack-trigger-sync.service';
import { EagleTrackApiClient } from './eagletrack-api.client';
import {
  EagleTrackMatchSource,
  EagleTrackReadingMetadata,
  EagleTrackRefData,
  EagleTrackSyncResult,
  EagleTrackTracker,
  EagleTrackTrackerLink,
  EagleTrackTrackerStatus,
  EagleTrackUnmatchedTracker,
} from './eagletrack.types';
import {
  collectMetadataOnlyIo,
  EAGLETRACK_IO,
  ENGINE_TEMPERATURE_CODES,
  FUEL_CONSUMPTION_LPH_CODES,
  FUEL_LEVEL_LITRE_CODES,
  FUEL_PERCENT_CODES,
  FUEL_USED_L_CODES,
  ODOMETER_KM_CODES,
  parseSignalEx,
  pickBooleanIo,
  pickNumericIo,
  RPM_CODES,
} from './eagletrack-io.map';
import { TelematicsData } from '../../types/telematics.types';

const EAGLETRACK_DEVICE_PREFIX = 'eagletrack-';

/**
 * How often the roster-shaped sub-syncs (drivers, triggers) run,
 * relative to the position poll that drives them.
 *
 * Fifteen minutes against a ~50-second position cadence, i.e. roughly
 * one in eighteen polls. A driver roster and a geofence list are
 * configuration, not telemetry -- they change when somebody edits them
 * in the vendor UI, which is a human-timescale event. Pulling them on
 * every poll would triple this integration's vendor request volume to
 * re-read identical data.
 */
export const SUB_SYNC_INTERVAL_MS = 15 * 60_000;

export function eagletrackDeviceIdFor(uin: string): string {
  return `${EAGLETRACK_DEVICE_PREFIX}${uin}`;
}

/**
 * A tracker resolved to one of this tenant's vehicles.
 *
 * `orgUnitId` is CARRIED from the matched vehicle rather than derived
 * separately -- the vehicle is the authority on its own unit, and any
 * second derivation would be a place for the two to disagree. See the
 * org-unit block in this file's header.
 */
export interface EagleTrackVehicleMatch {
  vehicleId: string;
  matchedBy: EagleTrackMatchSource;
  orgUnitId?: string;
}

/**
 * Parses Eagle Track's "YYYY-MM-DD HH:mm:ss" timestamp.
 *
 * TIMEZONE IS UNCONFIRMED AND THIS MATTERS. The vendor sends no offset
 * and no designator. Its user object carries a `timezone` field (an
 * offset in hours), which strongly suggests timestamps are rendered in
 * the token user's configured timezone rather than UTC -- but that is an
 * inference from the documentation, not a confirmed contract.
 *
 * Passing the raw string to `new Date()` would parse it as SERVER-LOCAL
 * time, which means the same payload yields different timestamps on a
 * developer laptop and a production container, and every fix silently
 * shifts if the deployment's TZ changes. That is the one outcome that is
 * definitely wrong.
 *
 * So: parse explicitly as UTC. Deterministic and server-locale
 * independent. The raw string is preserved on every reading
 * (`providerMetadata.rawDate`) so that if the vendor confirms a
 * different convention, historical rows can be corrected by a migration
 * instead of being unrecoverable. Listed in the changelog under
 * "requires provider confirmation".
 *
 * Returns null for anything unparseable rather than an Invalid Date --
 * an Invalid Date reaching Mongo produces a row that breaks every
 * downstream range query.
 */
export function parseEagleTrackDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  // Already carries an offset or a Z designator -- the vendor is being
  // explicit, so respect it rather than overriding with UTC.
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(trimmed)) {
    const explicit = new Date(trimmed);
    return Number.isNaN(explicit.getTime()) ? null : explicit;
  }

  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] ?? '0');

  const parsed = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (Number.isNaN(parsed.getTime())) return null;

  /**
   * Date.UTC ROLLS OVER out-of-range components rather than rejecting
   * them, so the regex alone is not enough:
   *   "0000-00-00 00:00:00" -> month index -1 -> 1899-11-30
   *   "2026-02-30 00:00:00" -> 2026-03-02
   *
   * A zero-date is a common vendor sentinel for "this tracker has never
   * reported", and silently storing it as an 1899 timestamp would put a
   * permanent outlier at the head of every history query and make the
   * staleness guard treat every subsequent fix as newer. Round-tripping
   * the components back out of the constructed Date rejects any value
   * that was silently corrected.
   */
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day ||
    parsed.getUTCHours() !== hour ||
    parsed.getUTCMinutes() !== minute ||
    parsed.getUTCSeconds() !== second
  ) {
    return null;
  }

  return parsed;
}

/**
 * Whether a payload carries a usable GPS fix.
 *
 * Rejects exact (0, 0) -- "null island". A tracker with no satellite
 * lock reports 0/0 rather than omitting the fields, and ingesting it
 * would place the vehicle in the Gulf of Guinea, corrupt distance
 * calculations, and fire geofence exit alerts for every vehicle that
 * briefly loses signal. No real fleet operates at exactly 0.000000 /
 * 0.000000, so the false-negative risk is nil.
 */
export function hasUsableFix(status: EagleTrackTrackerStatus): boolean {
  const { lat, lng } = status;
  if (typeof lat !== 'number' || typeof lng !== 'number') return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  if (lat === 0 && lng === 0) return false;
  return true;
}

/**
 * Derives the account username `GET /api2/last?user=<username>` needs to
 * authenticate a fleet-wide poll.
 *
 * WHY THIS EXISTS: production testing against a live deployment found
 * that the vendor-documented fleet-wide selector, `uin=__all_sub`, is
 * rejected outright on that deployment ("Access Denied:__all_sub"). The
 * selector that DOES work, `?user=<username>`, is not a static value --
 * it is the vendor account's username, and this integration is
 * multi-tenant, so it must be derived per sync rather than hardcoded.
 * ("Willsgrove" appears throughout this file's tests and comments only
 * because that is the account the live deployment used for testing; it
 * must never appear as a literal in the sync path itself.)
 *
 * ORDER, and why:
 *
 *   1. The first roster row's `belong` field. `belong` is the vendor's
 *      own "owning userid" on every tracker (see EagleTrackTracker.belong)
 *      and, on the deployment tested, is populated on every row and
 *      identical across all of them -- exactly the value `user=`
 *      expects. Preferred because it travels with the roster response
 *      this sync already fetched, needing no extra data.
 *   2. The first key of `refData.users`. Present on the same response,
 *      alongside the roster, as vendor UI lookup metadata; used only
 *      when no roster row carries a usable `belong` (an empty roster,
 *      or one where every row omits it).
 *
 * Returns null when neither source yields anything -- the caller must
 * treat that as "cannot poll this account", not guess a username.
 */
export function deriveEagleTrackUsername(
  trackers: EagleTrackTracker[],
  refData?: EagleTrackRefData
): string | null {
  for (const tracker of trackers) {
    const belong = tracker?.belong;
    if (typeof belong === 'string' && belong.trim()) {
      return belong.trim();
    }
  }

  const users = refData?.users;
  if (users && typeof users === 'object') {
    const [firstKey] = Object.keys(users);
    if (firstKey) return firstKey;
  }

  return null;
}

/** One plate value to try, and the roster field it came from. */
export interface EagleTrackPlateCandidate {
  value: string;
  source: EagleTrackMatchSource;
}

/**
 * The plate values we will attempt to match on, in priority order.
 *
 * Empty array means the tracker carries nothing usable and is unmatched
 * without a database round trip. See the file header for the ordering
 * rationale.
 */
export function plateCandidatesFromTracker(
  tracker: EagleTrackTracker | undefined
): EagleTrackPlateCandidate[] {
  if (!tracker) return [];

  const candidates: EagleTrackPlateCandidate[] = [];
  const seen = new Set<string>();

  const consider = (raw: unknown, source: EagleTrackMatchSource): void => {
    /**
     * The typeof guard is load-bearing for SECURITY, not just for types.
     * `raw` is untrusted vendor JSON: the declared field types are our
     * transcription of a document, not a contract the wire honours. A
     * non-string reaching findByLicensePlate hits `.toUpperCase()` and
     * throws mid-sync, and an OBJECT reaching it would be spread into a
     * Mongo filter -- `{ license_plate: { $ne: null } }` matches the
     * first vehicle in the tenant, which is precisely the silent
     * misattribution the matching rules exist to prevent.
     */
    if (typeof raw !== 'string') return;

    const trimmed = raw.trim();
    if (!trimmed) return;

    // Dedupe on the same casing findByLicensePlate matches on, so two
    // fields carrying the same plate cost one lookup rather than two.
    const key = trimmed.toUpperCase();
    if (seen.has(key)) return;
    seen.add(key);

    candidates.push({ value: trimmed, source });
  };

  consider(tracker.plate, 'plate');
  consider(tracker.__platenumber, 'platenumber');
  consider(tracker.name, 'name');

  return candidates;
}

export interface EagleTrackMappedReading {
  payload: Omit<TelematicsData, '_id' | 'createdAt' | 'updatedAt'> & { tenantId: string };
  timestamp: Date;
}

/**
 * The subset of a snapshot the staleness guard treats as "the telemetry
 * that matters" for deciding whether a fix with the SAME provider
 * timestamp as the one we hold is nonetheless a new observation.
 *
 * Deliberately snapshot-shaped rather than payload-shaped: it exists only
 * to be diffed against the previous snapshot's signature
 * (signaturesDiffer, below), never written to TelematicsData itself.
 * `null` (not `undefined`) marks "not reported" so an absent field
 * compares equal to another absent field rather than to `undefined !==
 * undefined` giving a false positive on every diff (JSON round-tripping
 * through Mongo also turns `undefined` into a dropped key, which would
 * make a stored signature compare unequal to a freshly-built one for a
 * reason that has nothing to do with the vendor's data).
 */
export interface EagleTrackFixSignature {
  speed: number | null;
  lat: number | null;
  lng: number | null;
  bearing: number | null;
  odometer: number | null;
  offline: boolean | null;
  id: number | null;
}

/** Builds the comparison signature for one snapshot. See EagleTrackFixSignature. */
export function buildEagleTrackFixSignature(status: EagleTrackTrackerStatus): EagleTrackFixSignature {
  return {
    speed: typeof status.speed === 'number' && Number.isFinite(status.speed) ? status.speed : null,
    lat: typeof status.lat === 'number' && Number.isFinite(status.lat) ? status.lat : null,
    lng: typeof status.lng === 'number' && Number.isFinite(status.lng) ? status.lng : null,
    bearing: typeof status.bearing === 'number' && Number.isFinite(status.bearing) ? status.bearing : null,
    odometer: typeof status.odometer === 'number' && Number.isFinite(status.odometer) ? status.odometer : null,
    offline: typeof status.offline === 'boolean' ? status.offline : null,
    id: typeof status.id === 'number' && Number.isFinite(status.id) ? status.id : null,
  };
}

/**
 * Whether two same-timestamp signatures represent different telemetry.
 *
 * `previous` may be missing entirely -- a device registered before this
 * guard existed, or one whose last ingest predates signature storage.
 * Treated as "cannot prove these are identical", which means "differs":
 * the safe default when a same-timestamp fix cannot be shown to be a
 * pure replay is to ingest it, not to drop it.
 */
export function signaturesDiffer(
  previous: EagleTrackFixSignature | null | undefined,
  current: EagleTrackFixSignature
): boolean {
  if (!previous) return true;
  return (
    previous.speed !== current.speed ||
    previous.lat !== current.lat ||
    previous.lng !== current.lng ||
    previous.bearing !== current.bearing ||
    previous.odometer !== current.odometer ||
    previous.offline !== current.offline ||
    previous.id !== current.id
  );
}

/**
 * Pure mapping from one Eagle Track snapshot onto our TelematicsData
 * shape. Separated from the I/O so it can be unit-tested directly
 * against sample payloads without mocking Mongo, the service layer, or
 * fetch.
 *
 * Returns null when the payload has no parseable timestamp -- the caller
 * treats that as an error for that tracker rather than inventing
 * `new Date()`, which would stamp a stale fix as current.
 */
export function mapStatusToTelematicsData(
  status: EagleTrackTrackerStatus,
  context: {
    tenantId: string;
    vehicleId: string;
    deviceId: string;
    tracker?: EagleTrackTracker;
    /**
     * The matched vehicle's org unit. Optional because a vehicle that
     * has not been assigned to one has nothing to inherit -- absent
     * stays absent rather than becoming a sentinel, exactly as with
     * every other field in this mapper.
     */
    orgUnitId?: string;
  }
): EagleTrackMappedReading | null {
  const timestamp = parseEagleTrackDate(status.date);
  if (!timestamp) return null;

  const io = status.io;
  // Speed keeps a 0 default and TelematicsLocation.speed stays required:
  // 0 is the FAIL-SAFE reading here (it resolves to 'idle', never to
  // 'moving'), api2 sends speed on every observed snapshot, and the
  // status/alerting paths all take speed as a number. Bearing gets no
  // such default -- see below.
  const speed = typeof status.speed === 'number' && Number.isFinite(status.speed) ? status.speed : 0;
  // NO `?? 0` FALLBACK. 0 degrees is due north, a perfectly legitimate
  // bearing, so substituting it for "not reported" makes every
  // non-reporting vehicle's direction wedge on the live map point the
  // same confidently-wrong way. Absent stays absent.
  const heading =
    typeof status.bearing === 'number' && Number.isFinite(status.bearing) ? status.bearing : undefined;

  const odometer = pickNumericIo(io, ODOMETER_KM_CODES);
  const fuelPercent = pickNumericIo(io, FUEL_PERCENT_CODES);
  const fuelLitres = pickNumericIo(io, FUEL_LEVEL_LITRE_CODES);
  const rpm = pickNumericIo(io, RPM_CODES);
  const engineTemp = pickNumericIo(io, ENGINE_TEMPERATURE_CODES);
  const consumption = pickNumericIo(io, FUEL_CONSUMPTION_LPH_CODES);
  const fuelUsed = pickNumericIo(io, FUEL_USED_L_CODES);

  /**
   * IGNITION (io["1"]). TelematicsData has no ignition field. Cartrack's
   * adapter expresses the same signal as `ignition_on && speed === 0`
   * -> trip.idleTime, and that is mirrored here so both providers feed
   * the idle metric identically rather than each inventing a convention.
   * `null` (not reported) is treated as "not idling" -- we only claim
   * idle time when the tracker positively reports ignition on.
   */
  const ignitionOn = pickBooleanIo(io, EAGLETRACK_IO.IGNITION);
  const idleTime = ignitionOn === true && speed === 0 ? 1 : 0;

  const metadata: EagleTrackReadingMetadata = {
    source: 'eagletrack',
    uin: status.uin,
  };

  if (typeof status.date === 'string') metadata.rawDate = status.date;
  if (typeof status.offline === 'boolean') metadata.offline = status.offline;

  const signalQuality = parseSignalEx(status.signalex);
  if (signalQuality) metadata.signalQuality = signalQuality;

  if (odometer) metadata.odometerSourceCode = odometer.code;
  if (fuelPercent) metadata.fuelPercentSourceCode = fuelPercent.code;
  // Litres never reach engine.fuelLevel (a percentage) -- see
  // FUEL_LEVEL_LITRE_CODES' comment for why that would fabricate alerts.
  if (fuelLitres) metadata.fuelLevelLitres = fuelLitres.value;

  if (status.alert && (status.alert.cmd || status.alert.trigger)) {
    metadata.vendorAlert = { cmd: status.alert.cmd, trigger: status.alert.trigger };
  }

  const extraIo = collectMetadataOnlyIo(io);
  if (Object.keys(extraIo).length > 0) metadata.io = extraIo;

  /**
   * NOTHING BELOW SUBSTITUTES 0 FOR AN ABSENT SIGNAL.
   *
   * Every field is written only when this snapshot actually carried it.
   * The previous `?? 0` defaults were invisible in the data but very
   * visible in the product: the live-map vehicle detail panel renders
   * whatever it is given, so a tracker with no OBD/CAN wiring reported
   * "0 rpm", "0 C" coolant, "0% throttle", "0% engine load" and "0.0 L"
   * fuel used -- readings that look like a seized engine rather than
   * like a device that simply has no engine bus attached. The panel has
   * always rendered "No data" for an absent field (see the `Stat`
   * component); it was never being given one.
   *
   * TWO CONSEQUENCES BEYOND DISPLAY, both fixed by the same change:
   *
   *   * `trip.odometer: 0` did not merely display wrongly, it WON over
   *     the vehicle's own recorded odometer in digital-twin.service.ts's
   *     `latestTelemetry?.trip?.odometer ?? vehicle.odometer ?? 0`
   *     fallback chain -- a real number replaced by a placeholder.
   *     Omitting it restores that fallback.
   *   * `averageSpeed`/`maxSpeed` were set to the INSTANTANEOUS speed of
   *     this single snapshot. api2's `last` endpoint carries no trip
   *     aggregation at all, so labelling one sample as a trip average or
   *     maximum was a category error, not a rounding one. Both are now
   *     omitted; `GET /api2/history` would be the honest source and is
   *     out of scope here (see this file's header).
   *
   * `throttlePosition` and `engineLoad` have no IO code in the vendor's
   * supported list at all, so they are never populated from this
   * provider and are simply never written.
   */
  const engine: TelematicsData['engine'] = {};
  if (rpm) engine.rpm = rpm.value;
  if (engineTemp) engine.coolantTemp = engineTemp.value;
  // Percent only -- litres never reach this field. See
  // FUEL_LEVEL_LITRE_CODES for why that would fabricate fuel alerts.
  if (fuelPercent) engine.fuelLevel = fuelPercent.value;

  // idleTime is DERIVED (ignition + zero speed), not read, so it is
  // always known and 0 here means "not idling", not "unreported".
  const trip: TelematicsData['trip'] = { idleTime };
  if (odometer) trip.odometer = odometer.value;

  /**
   * UNIT CORRECTION. io 199 is "Fuel Consumption, L/h" in the vendor's
   * own catalogue (see EAGLETRACK_IO_CATALOGUE), and it was being
   * written to `fuel.consumptionRate`, which the vehicle detail panel
   * renders with the suffix " L/100km". A litres-per-HOUR reading
   * displayed as litres-per-100km is not a rounding error, it is a
   * different quantity: an idling truck burning 2 L/h read as an
   * impossibly efficient 2 L/100km.
   *
   * `instantConsumption` is the field the panel already labels " L/h",
   * so the value now lands where its unit is true. Verified as the only
   * consumer: nothing else in the codebase reads either field.
   */
  const fuel: TelematicsData['fuel'] = {};
  if (consumption) fuel.instantConsumption = consumption.value;
  if (fuelUsed) fuel.fuelUsed = fuelUsed.value;

  const payload: Omit<TelematicsData, '_id' | 'createdAt' | 'updatedAt'> & { tenantId: string } = {
    deviceId: context.deviceId,
    vehicleId: context.vehicleId,
    tenantId: context.tenantId,
    ...(context.orgUnitId ? { orgUnitId: context.orgUnitId } : {}),
    location: {
      lat: status.lat as number,
      lng: status.lng as number,
      speed,
      ...(heading !== undefined ? { heading } : {}),
      // api2 reports neither altitude nor horizontal accuracy; 0 matches
      // what the Cartrack adapter records for the same absence. Left as
      // 0 rather than widened with the rest: neither is surfaced in any
      // UI today, so neither can mislead an operator, and both are
      // required by TelematicsLocation. Flagged in the changelog as the
      // remaining instance of this pattern rather than silently changed.
      altitude: 0,
      accuracy: 0,
      timestamp,
    },
    engine,
    trip,
    fuel,
    providerMetadata: metadata as unknown as Record<string, unknown>,
    timestamp,
  };

  return { payload, timestamp };
}

export class EagleTrackAdapter {
  /**
   * Builds an authenticated client for a tenant from its stored
   * (decrypted) config. Null when Eagle Track isn't configured/enabled.
   *
   * PUBLIC because the on-demand services (history, fuel, alerts) need
   * exactly this and nothing else from the adapter. Exposing the builder
   * rather than re-implementing it in five places keeps ONE definition
   * of "how a tenant's credentials become a client" -- which matters
   * because that definition is where the token is decrypted, and a
   * second copy is a second place for a decryption or enabled-flag check
   * to be got wrong.
   *
   * Returns a client, never the config: nothing outside this method and
   * eagletrackConfigRepository.getResolvedConfig ever holds the token.
   */
  async buildClientFor(tenantId: string): Promise<EagleTrackApiClient | null> {
    return this.buildClient(tenantId);
  }

  /**
   * Resolves a tracker uin to one of this tenant's vehicles, using the
   * same precedence the sync uses (link, then plate/platenumber/name).
   *
   * Exposed for the on-demand services, which are given a uin by an
   * HTTP caller and must arrive at the same vehicle the sync would --
   * two different answers to "whose tracker is this" is how a
   * misattributed history backfill happens.
   */
  async resolveVehicleForUin(
    tenantId: string,
    uin: string,
    tracker?: EagleTrackTracker
  ): Promise<EagleTrackVehicleMatch | null> {
    const links = await eagletrackTrackerLinkRepository.mapByUin(tenantId);
    return this.matchVehicle(tenantId, uin, tracker, links);
  }

  /** Builds an authenticated client for a tenant from its stored (decrypted) config. Null when Eagle Track isn't configured/enabled. */
  private async buildClient(tenantId: string): Promise<EagleTrackApiClient | null> {
    const config = await eagletrackConfigRepository.getResolvedConfig(tenantId);
    if (!config || !config.enabled) return null;

    return new EagleTrackApiClient({
      domain: config.domain,
      token: config.token,
    });
  }

  /**
   * Pulls the whole account's current status for one tenant, matches each
   * reading to an internal vehicle, and ingests it.
   *
   * Safe to call repeatedly. Cartrack's adapter achieves that by simply
   * appending a timestamped point; this one additionally refuses to
   * re-append a fix it has already stored (see the staleness guard in
   * ingestStatus). That difference is deliberate: `GET /api2/last`
   * returns the LAST KNOWN fix, so a parked or offline vehicle returns
   * the identical snapshot on every poll. At the default 2-minute cadence
   * that is 720 duplicate rows per vehicle per day, each one re-running
   * geofence evaluation and re-marking a dead device as "active".
   */
  async syncOrganization(tenantId: string): Promise<EagleTrackSyncResult> {
    const result: EagleTrackSyncResult = {
      tenantId,
      matched: 0,
      matchedBy: { link: 0, plate: 0, platenumber: 0, name: 0 },
      skippedStale: 0,
      skippedNoFix: 0,
      unmatchedTrackers: [],
      trackersWithoutFix: [],
      errors: [],
      syncedAt: new Date(),
    };

    const client = await this.buildClient(tenantId);
    if (!client) {
      result.errors.push('Eagle Track is not configured or not enabled for this organization.');
      return result;
    }

    // The roster is required, not optional: `last` carries no plate
    // field, so without /api2/trackers there is nothing to match on. It
    // is now ALSO the only source of the account username the live-status
    // call authenticates with -- see deriveEagleTrackUsername.
    let roster: EagleTrackTracker[];
    let refData: EagleTrackRefData | undefined;
    try {
      const rosterResponse = await client.getTrackersWithRefData();
      roster = rosterResponse.trackers;
      refData = rosterResponse.refData;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown Eagle Track API error';
      result.errors.push(message);
      await eagletrackConfigRepository.recordSyncResult(tenantId, 'error', message);
      monitoring.logError('[EagleTrackAdapter] Tracker roster fetch failed', error as Error, { tenantId });
      return result;
    }

    // Nothing to match against and, as of this deployment's rejection of
    // `uin=__all_sub`, no username to derive either. Reported as a clean
    // empty sync -- an account with no trackers yet is not an error --
    // rather than attempting a /last call that has nothing to poll for.
    if (roster.length === 0) {
      await eagletrackConfigRepository.recordSyncResult(tenantId, 'success');
      return result;
    }

    const trackersByUin = new Map<string, EagleTrackTracker>();
    for (const tracker of roster) {
      trackersByUin.set(String(tracker.uin), tracker);
    }

    // ONE query for every operator-declared link in the tenant, not one
    // per tracker. A 500-tracker account would otherwise add 500 round
    // trips to a poll that already runs every staleness window.
    const links = await eagletrackTrackerLinkRepository.mapByUin(tenantId);

    const username = deriveEagleTrackUsername(roster, refData);
    if (!username) {
      const message =
        'Eagle Track: could not derive an account username from the tracker roster ' +
        '(no roster row carries a `belong` value and refData.users is empty) -- skipping the live-status poll.';
      result.errors.push(message);
      await eagletrackConfigRepository.recordSyncResult(tenantId, 'error', message);
      monitoring.logError('[EagleTrackAdapter] Could not derive account username', new Error(message), { tenantId });
      return result;
    }

    let statuses: EagleTrackTrackerStatus[];
    try {
      statuses = await client.getLastForAll(username);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown Eagle Track API error';
      result.errors.push(message);
      await eagletrackConfigRepository.recordSyncResult(tenantId, 'error', message);
      monitoring.logError('[EagleTrackAdapter] Fleet status fetch failed', error as Error, { tenantId });
      return result;
    }

    const seenUins = new Set<string>();

    for (const status of statuses) {
      seenUins.add(status.uin);

      try {
        const outcome = await this.ingestStatus(tenantId, status, trackersByUin.get(status.uin), links);

        // Counted for every outcome that resolved to a vehicle, so
        // matchedBy sums to matched + skippedNoFix (see its doc comment).
        if (outcome.matchedBy) {
          result.matchedBy[outcome.matchedBy] += 1;
        }

        switch (outcome.status) {
          case 'ingested':
            result.matched += 1;
            break;
          case 'stale':
            result.matched += 1;
            result.skippedStale += 1;
            break;
          case 'no-fix':
            result.skippedNoFix += 1;
            break;
          case 'unmatched':
            result.unmatchedTrackers.push(status.uin);
            break;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown ingestion error';
        result.errors.push(`${status.uin}: ${message}`);
        monitoring.logError('[EagleTrackAdapter] Failed to ingest tracker status', error as Error, {
          tenantId,
          uin: status.uin,
        });
      }
    }

    // Trackers on the roster that the fleet poll did not return. Usually
    // a device that has never reported; it can also mean the derived
    // `user=<username>` account does not cover every tracker on the
    // roster (e.g. a mixed-ownership deployment -- see
    // deriveEagleTrackUsername). Either way it is reported rather than
    // silently treated as "no vehicles to sync".
    for (const uin of trackersByUin.keys()) {
      if (!seenUins.has(uin)) result.trackersWithoutFix.push(uin);
    }

    /**
     * DRIVER AND TRIGGER SUB-SYNCS.
     *
     * Gated on their own, much slower cadence (see SUB_SYNC_INTERVAL_MS)
     * rather than running on every position poll. The read-through
     * refresh fires this whole sync roughly once per staleness window
     * for any tenant with the map open, and a driver roster does not
     * change on that timescale -- pulling two extra endpoints every
     * ~50 seconds would triple this integration's request volume against
     * the vendor to re-read data that is identical every time.
     *
     * Isolated from the position poll in BOTH directions: a sub-sync
     * failure is recorded in its own result and in `result.errors`, and
     * cannot stop positions being reported. Positions are the thing an
     * operator is actually looking at.
     */
    if (await this.shouldRunSubSyncs(tenantId)) {
      /**
       * Wrapped, because "isolated in both directions" has to be true in
       * code and not only in the comment above. Both services already
       * return their failures in `errors` rather than throwing, but a
       * bug in either -- or a rejection from a dependency they did not
       * anticipate -- must not cost an operator the vehicle positions
       * they are actually looking at. Positions are the product; a
       * driver roster refresh is not.
       */
      try {
        result.drivers = await eagletrackDriverSyncService.sync(tenantId, client);
        result.errors.push(...(result.drivers?.errors ?? []));
      } catch (error) {
        result.errors.push(
          `drivers: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }

      try {
        result.triggers = await eagletrackTriggerSyncService.sync(tenantId, client, links);
        result.errors.push(...(result.triggers?.errors ?? []));
      } catch (error) {
        result.errors.push(
          `triggers: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }

    /**
     * The unmatched snapshot the admin mapping screen reads.
     *
     * Recorded from the ROSTER rather than from the status payload, so a
     * tracker that has never reported a fix -- the most likely thing to
     * need linking by hand, since it has no telemetry to match on -- is
     * still listed. `hadFix` distinguishes the two cases for the
     * operator without needing a second data source.
     */
    const unmatchedSet = new Set(result.unmatchedTrackers);
    const unmatchedSnapshot: EagleTrackUnmatchedTracker[] = [];
    for (const [uin, tracker] of trackersByUin) {
      const hadFix = seenUins.has(uin);
      // A tracker with no fix has never been through matching at all, so
      // "did the sync fail to place it" is only answerable for the ones
      // that were. Both are offered to the screen; neither is guessed at.
      if (!unmatchedSet.has(uin) && hadFix) continue;
      if (links.has(uin)) continue;

      unmatchedSnapshot.push({
        uin,
        ...(typeof tracker.name === 'string' && tracker.name ? { name: tracker.name } : {}),
        ...(typeof tracker.plate === 'string' && tracker.plate ? { plate: tracker.plate } : {}),
        ...(typeof tracker.model === 'string' && tracker.model ? { model: tracker.model } : {}),
        hadFix,
      });
    }

    await eagletrackConfigRepository.recordSyncResult(
      tenantId,
      result.errors.length > 0 && result.matched === 0 ? 'error' : 'success',
      result.errors[0],
      { unmatchedTrackers: unmatchedSnapshot }
    );

    return result;
  }

  /**
   * Whether the roster-shaped sub-syncs are due.
   *
   * Read off the config's own `lastDriverSyncAt`, which is the same
   * pattern (and the same document) the read-through refresh already
   * uses for `lastSyncAt` -- so this needs no new state and no
   * scheduler, and it self-heals: a process that dies mid-sub-sync
   * simply leaves the timestamp unadvanced and the next poll retries.
   *
   * Fails CLOSED on a read error: if the config cannot be read, the
   * sub-syncs do not run. Skipping a roster refresh costs nothing;
   * hammering a vendor endpoint every 50 seconds because a Mongo blip
   * made staleness unreadable costs an operator their API access.
   */
  private async shouldRunSubSyncs(tenantId: string): Promise<boolean> {
    try {
      const config = await eagletrackConfigRepository.getConfig(tenantId);
      const last = config?.lastDriverSyncAt;
      if (!last) return true;
      return Date.now() - new Date(last).getTime() > SUB_SYNC_INTERVAL_MS;
    } catch {
      return false;
    }
  }

  /**
   * Resolves a tracker to a vehicle in this tenant, or null.
   *
   * Walks plateCandidatesFromTracker in order and returns the FIRST
   * candidate that resolves. Every lookup is
   * vehicleRepository.findByLicensePlate, which is tenant-scoped and an
   * exact equality match -- this method adds ordering, not leniency.
   */
  private async matchVehicle(
    tenantId: string,
    uin: string,
    tracker: EagleTrackTracker | undefined,
    links: Map<string, EagleTrackTrackerLink>
  ): Promise<EagleTrackVehicleMatch | null> {
    /**
     * STEP 0 -- the operator's own declaration, which outranks every
     * heuristic below.
     *
     * The link is still VERIFIED against the vehicle table rather than
     * trusted outright: a vehicle can be deleted after a link is made,
     * and a link pointing at a row that no longer exists must fall
     * through to the heuristics (or to unmatched) rather than ingest
     * against a dangling id. The lookup is tenant-scoped, so a link
     * carrying another tenant's vehicleId -- which the write path
     * already prevents -- would resolve to nothing here too. Defence in
     * depth, not redundancy: this is the read side of the boundary.
     */
    const link = links.get(uin);
    if (link?.vehicleId) {
      const linked = await vehicleRepository.findById(link.vehicleId, tenantId);
      if (linked?._id) {
        return {
          vehicleId: String(linked._id),
          matchedBy: 'link',
          ...(linked.orgUnitId ? { orgUnitId: linked.orgUnitId } : {}),
        };
      }
    }

    for (const candidate of plateCandidatesFromTracker(tracker)) {
      const vehicle = await vehicleRepository.findByLicensePlate(candidate.value, tenantId);
      if (vehicle?._id) {
        return {
          vehicleId: vehicle._id,
          matchedBy: candidate.source,
          // Carried, not derived. See the org-unit block in this file's
          // header for why every reading needs it.
          ...(vehicle.orgUnitId ? { orgUnitId: vehicle.orgUnitId } : {}),
        };
      }
    }

    return null;
  }

  /**
   * Maps and ingests a single Eagle Track reading.
   *
   *   'unmatched' -- no vehicle in this tenant owns this tracker.
   *   'no-fix'    -- matched, but the payload carries no usable position.
   *   'stale'     -- matched, but we already hold this fix (or a newer one).
   *   'ingested'  -- written through telematicsService.
   *
   * `matchedBy` is present for every outcome except 'unmatched', so
   * syncOrganization can report which roster field the integration is
   * actually standing on.
   *
   * Never throws for any of the first three: they are ordinary states of
   * a real fleet, not failures.
   */
  private async ingestStatus(
    tenantId: string,
    status: EagleTrackTrackerStatus,
    tracker: EagleTrackTracker | undefined,
    links: Map<string, EagleTrackTrackerLink>
  ): Promise<{ status: 'ingested' | 'stale' | 'no-fix' | 'unmatched'; matchedBy?: EagleTrackMatchSource }> {
    const match = await this.matchVehicle(tenantId, status.uin, tracker, links);
    if (!match) return { status: 'unmatched' };

    const { vehicleId, matchedBy, orgUnitId } = match;

    if (!hasUsableFix(status)) return { status: 'no-fix', matchedBy };

    const deviceId = eagletrackDeviceIdFor(status.uin);
    // One read serves both purposes: registering the device if new, and
    // supplying lastPingAt for the staleness guard below. No extra round
    // trip.
    const existingDevice = await telematicsRepository.getDevice(deviceId, tenantId);
    if (!existingDevice) {
      await this.registerDevice(deviceId, vehicleId, tenantId, status, tracker, matchedBy, orgUnitId);
    }

    const mapped = mapStatusToTelematicsData(status, {
      tenantId,
      vehicleId,
      deviceId,
      tracker,
      orgUnitId,
    });

    if (!mapped) {
      throw new Error(`Unparseable timestamp from Eagle Track: ${String(status.date)}`);
    }

    /**
     * STALENESS GUARD.
     *
     * Compared strictly against the PROVIDER'S OWN timestamp for the last
     * fix we ingested (`existingDevice.lastFixAt`) -- never against
     * `lastPingAt`, which is our server's wall-clock ingest time and has
     * no fixed relationship to the provider's clock. Comparing a fresh
     * provider `date` against a stale server wall-clock reading was
     * exactly the bug this guard existed to avoid falling into: poll
     * latency and any provider clock/timezone drift make wall-clock
     * "now" an unrelated timeline to the provider's own timestamps, so
     * that comparison could mark every incoming fix "stale" even though
     * the provider was sending fresh, changing data on every poll
     * (matched: N, skippedStale: N, forever).
     *
     * Three cases, in order:
     *   1. No prior fix on record (new device, or one predating this
     *      guard) -- always ingest.
     *   2. Provider date is strictly newer than the one we hold --
     *      always ingest, unconditionally. A newer provider timestamp is
     *      never treated as stale, regardless of what changed.
     *   3. Provider date is EQUAL to the one we hold -- ingest only if
     *      the telemetry itself changed (speed, odometer, offline flag,
     *      position, bearing, or vendor id; see signaturesDiffer). This
     *      is what keeps a genuinely unchanged replay (a parked vehicle
     *      returning the identical snapshot every poll) from appending a
     *      duplicate point, while not discarding a real update that
     *      happens to share a timestamp with the one before it.
     *   4. Provider date is strictly older -- stale. A fleet poll must
     *      never regress a vehicle's position on the live map.
     */
    const lastFixAt = existingDevice?.lastFixAt ? new Date(existingDevice.lastFixAt) : null;
    const currentSignature = buildEagleTrackFixSignature(status);

    if (lastFixAt && !Number.isNaN(lastFixAt.getTime())) {
      const comparison = mapped.timestamp.getTime() - lastFixAt.getTime();

      if (comparison < 0) {
        return { status: 'stale', matchedBy };
      }

      if (comparison === 0) {
        const previousSignature = existingDevice?.metadata?.eagletrackLastFix as
          | EagleTrackFixSignature
          | undefined;
        if (!signaturesDiffer(previousSignature, currentSignature)) {
          return { status: 'stale', matchedBy };
        }
      }
    }

    await telematicsService.ingestTelematicsData(mapped.payload);
    await telematicsRepository.updateDeviceLastPing(deviceId, tenantId, mapped.payload.location, {
      fixTimestamp: mapped.timestamp,
      metadataPatch: { eagletrackLastFix: currentSignature },
    });

    return { status: 'ingested', matchedBy };
  }

  private async registerDevice(
    deviceId: string,
    vehicleId: string,
    tenantId: string,
    status: EagleTrackTrackerStatus,
    tracker: EagleTrackTracker | undefined,
    matchedBy: EagleTrackMatchSource,
    orgUnitId?: string
  ): Promise<void> {
    await telematicsRepository.registerDevice(
      {
        deviceId,
        vehicleId,
        tenantId,
        // Inherited from the matched vehicle, as
        // telematics.tenancy-addendum.ts specifies for
        // TelematicsDevice. Without it getOfflineDevicesInScope returns
        // nothing for a scoped caller, so a branch manager could never
        // see that their own tracker had gone dark.
        ...(orgUnitId ? { orgUnitId } : {}),
        type: 'gps',
        manufacturer: 'Eagle Track',
        model: typeof tracker?.model === 'string' && tracker.model ? tracker.model : 'api2',
        firmwareVersion: 'n/a',
        status: 'active',
        metadata: {
          source: 'eagletrack',
          uin: status.uin,
          /**
           * Which roster field linked this device to this vehicle. Kept
           * because if the link is ever wrong, this is the first thing
           * anyone needs to know -- and it cannot be re-derived later
           * from a vendor payload we did not store.
           */
          matchedBy,
          trackerName: typeof tracker?.name === 'string' ? tracker.name : undefined,
          // The vendor-side owning userid. Recorded for support/debugging
          // only -- our tenancy is decided by the matched vehicle, never
          // by a field the vendor controls.
          vendorOwner: typeof tracker?.belong === 'string' ? tracker.belong : undefined,
        },
      } as Parameters<typeof telematicsRepository.registerDevice>[0],
      tenantId
    );
  }

  /** Verifies stored credentials without pulling a full fleet payload -- backs "test connection" in settings. */
  async testConnection(tenantId: string): Promise<boolean> {
    const client = await this.buildClient(tenantId);
    if (!client) return false;
    return client.verifyCredentials();
  }
}

export const eagletrackAdapter = new EagleTrackAdapter();
