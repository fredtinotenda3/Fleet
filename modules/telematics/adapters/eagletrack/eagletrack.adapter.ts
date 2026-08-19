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
// RESIDUAL AMBIGUITY, stated rather than hidden: if `plate` and `name`
// hold the plates of two DIFFERENT vehicles, the order above resolves it
// deterministically to `plate` and nothing flags the conflict. The
// counters in result.matchedBy make the reliance visible, but they are
// not a substitute for the correct long-term fix, which has not changed:
// an explicit, admin-managed uin <-> vehicle mapping table (a small
// settings screen listing unmatched uins next to a vehicle picker),
// removing the dependency on vendor free text entirely.
// `unmatchedTrackers` is exactly the input such a screen would need,
// which is why it is reported rather than logged and forgotten.
//
// ---------------------------------------------------------------------
// SCOPED OUT OF THIS PASS (extension points, not oversights)
// ---------------------------------------------------------------------
//   * GET /api2/history and GET /api2/reports/<name> -- historical
//     backfill and vendor-side reporting. Only `last` (status polling)
//     and `trackers` (roster/matching) are implemented, mirroring how
//     CartrackAdapter is scoped to getFleetStatus/getVehicleStatus.
//   * Vendor-side triggers/alerts (`alert.cmd` / `alert.trigger`,
//     referencing /api2/triggers geofence/speed/idle/stop/route
//     objects). Recorded verbatim in the reading's provider metadata,
//     but NOT reconciled with our own TelematicsAlert/geofence engine --
//     reconciling two independent alerting systems (dedup, severity
//     mapping, acknowledgement ownership) is a larger piece of work in
//     its own right. Everything funnels through ingestTelematicsData so
//     OUR alerting runs uniformly regardless of source, exactly as
//     Cartrack's adapter does.

import { vehicleRepository } from '@/modules/vehicles/repositories/vehicle.repository';
import { monitoring } from '@/infrastructure/monitoring/logger';
import { telematicsService } from '../../services/telematics.service';
import { telematicsRepository } from '../../repositories/telematics.repository';
import { eagletrackConfigRepository } from '../../repositories/eagletrack-config.repository';
import { EagleTrackApiClient } from './eagletrack-api.client';
import {
  EagleTrackMatchSource,
  EagleTrackReadingMetadata,
  EagleTrackRefData,
  EagleTrackSyncResult,
  EagleTrackTracker,
  EagleTrackTrackerStatus,
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

export function eagletrackDeviceIdFor(uin: string): string {
  return `${EAGLETRACK_DEVICE_PREFIX}${uin}`;
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
  context: { tenantId: string; vehicleId: string; deviceId: string; tracker?: EagleTrackTracker }
): EagleTrackMappedReading | null {
  const timestamp = parseEagleTrackDate(status.date);
  if (!timestamp) return null;

  const io = status.io;
  const speed = typeof status.speed === 'number' && Number.isFinite(status.speed) ? status.speed : 0;
  const heading = typeof status.bearing === 'number' && Number.isFinite(status.bearing) ? status.bearing : 0;

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

  const payload: Omit<TelematicsData, '_id' | 'createdAt' | 'updatedAt'> & { tenantId: string } = {
    deviceId: context.deviceId,
    vehicleId: context.vehicleId,
    tenantId: context.tenantId,
    location: {
      lat: status.lat as number,
      lng: status.lng as number,
      speed,
      heading,
      // api2 reports neither altitude nor horizontal accuracy; 0 matches
      // what the Cartrack adapter records for the same absence.
      altitude: 0,
      accuracy: 0,
      timestamp,
    },
    engine: {
      rpm: rpm?.value ?? 0,
      coolantTemp: engineTemp?.value ?? 0,
      // Deliberately absent when unreported, NOT 0 -- see the doc comment
      // on TelematicsData.engine.fuelLevel.
      ...(fuelPercent ? { fuelLevel: fuelPercent.value } : {}),
      throttlePosition: 0,
      engineLoad: 0,
    },
    trip: {
      odometer: odometer?.value ?? 0,
      tripDistance: 0,
      tripDuration: 0,
      averageSpeed: speed,
      maxSpeed: speed,
      idleTime,
    },
    fuel: {
      consumptionRate: consumption?.value ?? 0,
      instantConsumption: 0,
      fuelUsed: fuelUsed?.value ?? 0,
    },
    providerMetadata: metadata as unknown as Record<string, unknown>,
    timestamp,
  };

  return { payload, timestamp };
}

export class EagleTrackAdapter {
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
      matchedBy: { plate: 0, platenumber: 0, name: 0 },
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
        const outcome = await this.ingestStatus(tenantId, status, trackersByUin.get(status.uin));

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

    await eagletrackConfigRepository.recordSyncResult(
      tenantId,
      result.errors.length > 0 && result.matched === 0 ? 'error' : 'success',
      result.errors[0]
    );

    return result;
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
    tracker: EagleTrackTracker | undefined
  ): Promise<{ vehicleId: string; matchedBy: EagleTrackMatchSource } | null> {
    for (const candidate of plateCandidatesFromTracker(tracker)) {
      const vehicle = await vehicleRepository.findByLicensePlate(candidate.value, tenantId);
      if (vehicle?._id) {
        return { vehicleId: vehicle._id, matchedBy: candidate.source };
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
    tracker: EagleTrackTracker | undefined
  ): Promise<{ status: 'ingested' | 'stale' | 'no-fix' | 'unmatched'; matchedBy?: EagleTrackMatchSource }> {
    const match = await this.matchVehicle(tenantId, tracker);
    if (!match) return { status: 'unmatched' };

    const { vehicleId, matchedBy } = match;

    if (!hasUsableFix(status)) return { status: 'no-fix', matchedBy };

    const deviceId = eagletrackDeviceIdFor(status.uin);
    // One read serves both purposes: registering the device if new, and
    // supplying lastPingAt for the staleness guard below. No extra round
    // trip.
    const existingDevice = await telematicsRepository.getDevice(deviceId, tenantId);
    if (!existingDevice) {
      await this.registerDevice(deviceId, vehicleId, tenantId, status, tracker, matchedBy);
    }

    const mapped = mapStatusToTelematicsData(status, {
      tenantId,
      vehicleId,
      deviceId,
      tracker,
    });

    if (!mapped) {
      throw new Error(`Unparseable timestamp from Eagle Track: ${String(status.date)}`);
    }

    const lastPingAt = existingDevice?.lastPingAt ? new Date(existingDevice.lastPingAt) : null;
    if (lastPingAt && !Number.isNaN(lastPingAt.getTime()) && mapped.timestamp.getTime() <= lastPingAt.getTime()) {
      return { status: 'stale', matchedBy };
    }

    await telematicsService.ingestTelematicsData(mapped.payload);
    await telematicsRepository.updateDeviceLastPing(deviceId, tenantId, mapped.payload.location);

    return { status: 'ingested', matchedBy };
  }

  private async registerDevice(
    deviceId: string,
    vehicleId: string,
    tenantId: string,
    status: EagleTrackTrackerStatus,
    tracker: EagleTrackTracker | undefined,
    matchedBy: EagleTrackMatchSource
  ): Promise<void> {
    await telematicsRepository.registerDevice(
      {
        deviceId,
        vehicleId,
        tenantId,
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
