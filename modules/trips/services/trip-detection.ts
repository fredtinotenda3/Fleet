// modules/trips/services/trip-detection.ts
//
// PURE trip detection: an ordered stream of telemetry readings in, a set
// of completed trip segments plus the carried-forward state out.
//
// ---------------------------------------------------------------------
// WHY THIS FILE HAS NO I/O AT ALL
// ---------------------------------------------------------------------
// Everything that makes trip generation *correct* -- when a trip starts,
// when it ends, how far it went, whether two runs of the job produce the
// same answer -- is arithmetic over a sequence. Everything that makes it
// *safe* -- tenancy, org units, idempotent writes -- is I/O.
//
// Mixing them produces a detector that can only be tested against a
// database, which in practice means it is tested against three happy
// paths and no boundary conditions at all. The boundary conditions are
// the whole problem here: a device that goes dark mid-trip, a vehicle
// that idles at a depot for an hour, an odometer that jumps backwards,
// readings that arrive out of order.
//
// So: this file is a function. trip-generation.service.ts is the shell
// that feeds it and writes what it returns.
//
// ---------------------------------------------------------------------
// WHY BATCH, NOT PER-PING
// ---------------------------------------------------------------------
// The obvious place to hook this is ingestTelematicsData, on every ping.
// That was rejected:
//
//   * it adds a state read + write to the hot path, on a pipeline
//     already doing a geofence evaluation per fix;
//   * it cannot be re-run, so a bug in detection means the trips are
//     wrong forever with no way to rebuild them;
//   * a multi-instance deployment would race two workers through the
//     same vehicle's state.
//
// Running as a scheduled sweep over persisted readings makes the whole
// thing re-runnable and idempotent, at the cost of trips appearing
// within one job interval rather than instantly. For a record whose
// consumers are cost-per-km, utilisation and maintenance forecasting,
// that latency is irrelevant.
//
// ---------------------------------------------------------------------
// SIGNAL PRIORITY
// ---------------------------------------------------------------------
// 1. IGNITION is authoritative when reported. `ignition: false` ends a
//    trip immediately -- the engine is off, the vehicle is not going
//    anywhere, and no timeout needs to elapse to prove it.
// 2. MOVEMENT is the fallback. Neither current adapter guarantees
//    ignition (Cartrack reports it, Eagle Track reports it via io["1"],
//    an HTTP-ingest device may report neither), so speed above a
//    threshold starts a trip and a sustained stop ends one.
// 3. A GAP in readings ends the trip at the last reading rather than
//    stretching it across the silence. A device that goes dark for six
//    hours has not been on a six-hour trip.
//
// `ignition` is tri-state via optionality throughout: absent means "this
// device does not report it", NOT "off". Treating absent as off would
// end every trip on the first reading from an HTTP-ingest device.

/** One reading, reduced to only what detection needs. */
export interface DetectionReading {
  timestamp: Date;
  /** km/h. Absent means unreported; treated as not-moving evidence only. */
  speed?: number;
  lat?: number;
  lng?: number;
  /** Cumulative vehicle odometer in km. */
  odometer?: number;
  /** Tri-state. `undefined` means the device does not report ignition. */
  ignition?: boolean;
}

/** Carried between runs so a trip can span batches. */
export interface TripDetectionState {
  /** Open trip, or null when the vehicle is parked. */
  open: OpenTrip | null;
  /**
   * Timestamp of the last reading this vehicle has been processed up to.
   * The watermark. Readings at or before this are never reconsidered,
   * which is what makes a re-run idempotent rather than duplicating.
   */
  lastProcessedAt: Date | null;
}

export interface OpenTrip {
  startAt: Date;
  startLat?: number;
  startLng?: number;
  startOdometer?: number;
  /** Last reading seen while the trip was open. */
  lastAt: Date;
  lastLat?: number;
  lastLng?: number;
  lastOdometer?: number;
  /** Last time the vehicle was positively observed moving. */
  lastMovingAt: Date;
  /** Haversine distance accumulated between consecutive fixes, km. */
  pathKm: number;
  maxSpeedKmh: number;
  readingCount: number;
}

/** A finished trip, ready to be written. */
export interface DetectedTrip {
  startAt: Date;
  endAt: Date;
  startLat?: number;
  startLng?: number;
  endLat?: number;
  endLng?: number;
  durationMinutes: number;
  /**
   * Kilometres. `null` when neither an odometer delta nor a GPS path
   * could be established -- never 0, which would read as "this vehicle
   * moved nowhere" and would silently drag fleet cost-per-km toward
   * infinity. See the fabricated-metrics work for why this codebase
   * treats an unmeasurable value as absent.
   */
  distanceKm: number | null;
  /** How `distanceKm` was established, for display and for audit. */
  distanceSource: 'odometer' | 'gps-path' | null;
  maxSpeedKmh: number | null;
  averageSpeedKmh: number | null;
  readingCount: number;
  /** Why the trip ended. Kept on the record -- an operator asking "why is this trip 4 minutes long" deserves an answer. */
  endReason: 'ignition-off' | 'stopped' | 'signal-gap';
}

export interface TripDetectionConfig {
  /** At or above this speed the vehicle counts as moving. km/h. */
  movingSpeedKmh: number;
  /** Stationary for this long (with ignition on or unreported) ends the trip. */
  stopMinutes: number;
  /**
   * No readings for LONGER than this ends the trip at the last one.
   *
   * Strictly greater-than, not >=. A device polling on exactly this
   * cadence would otherwise gap-close on every single reading, which
   * fragments every journey into discarded single-fix stubs and loses
   * the trip entirely.
   */
  signalGapMinutes: number;
  /** Trips shorter than this in BOTH time and distance are discarded. */
  minTripMinutes: number;
  minTripKm: number;
}

/**
 * Defaults chosen for mixed commercial fleets (trucks, tractors, light
 * vehicles), which is what this deployment runs.
 *
 * `movingSpeedKmh: 5` rather than 0: GPS jitter on a stationary vehicle
 * routinely reports 1-3 km/h, and a 0 threshold turns a truck parked
 * overnight into hundreds of one-minute trips.
 *
 * `stopMinutes: 5` is the loading-bay compromise. Shorter fragments a
 * single delivery run into a trip per stop; much longer merges a
 * morning and afternoon route into one. Five minutes is the common
 * default across commercial telematics products and is the safest
 * starting point, not a tuned value -- it is exposed in the config so an
 * operator can change it per deployment without a code change.
 *
 * `minTripMinutes: 2` / `minTripKm: 0.5` discard yard shuffling. A
 * segment must fail BOTH to be discarded: a 3 km move that took 90
 * seconds is real, and so is a 20-minute crawl through 400 m of traffic.
 */
export const DEFAULT_TRIP_DETECTION_CONFIG: TripDetectionConfig = {
  movingSpeedKmh: 5,
  stopMinutes: 5,
  /**
   * 60, not 30.
   *
   * 30 was the first value here and it was wrong: 30 minutes is a
   * perfectly ordinary reporting cadence for a low-cost tracker, and a
   * legitimate coverage gap for a vehicle in a tunnel, a valley or rural
   * Zimbabwe. At 30 the rule fired on NORMAL operation -- a vehicle
   * reporting every 30 minutes had every journey split into single-fix
   * stubs, each of which then failed the minimum-trip test and was
   * discarded, so the whole day's driving produced ZERO trips. That is
   * the worst possible failure mode: not a wrong trip, but silence.
   *
   * 60 minutes is unambiguous -- no working tracker on a moving vehicle
   * stays silent that long. Deployments polling more slowly than hourly
   * cannot support trip detection at all and should lower this
   * deliberately rather than inherit a default that quietly deletes
   * their data.
   */
  signalGapMinutes: 60,
  minTripMinutes: 2,
  minTripKm: 0.5,
};

const EARTH_RADIUS_KM = 6371;

/** Great-circle distance in km. Exported for testing. */
export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

function minutesBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / 60_000;
}

function hasFix(r: DetectionReading): r is DetectionReading & { lat: number; lng: number } {
  return typeof r.lat === 'number' && typeof r.lng === 'number';
}

/**
 * True when this reading is evidence of motion.
 *
 * Ignition alone is NOT motion -- a truck idling at a depot has ignition
 * on and is going nowhere, and treating that as movement is what makes a
 * "trip" that covers zero kilometres over four hours.
 */
function isMoving(r: DetectionReading, config: TripDetectionConfig): boolean {
  if (r.ignition === false) return false;
  return typeof r.speed === 'number' && r.speed >= config.movingSpeedKmh;
}

/**
 * Odometer delta, when both ends are present and sane.
 *
 * Returns null on a backwards or absurd reading rather than a negative
 * or wild distance. Odometers are replaced, reset and misreported; a
 * single bad fix must not post a -84,000 km trip into the ledger.
 * Mirrors the guard in odometer-reconciliation.ts.
 */
function odometerDelta(open: OpenTrip): number | null {
  const { startOdometer, lastOdometer } = open;
  if (typeof startOdometer !== 'number' || typeof lastOdometer !== 'number') return null;
  if (startOdometer <= 0 || lastOdometer <= 0) return null; // 0 means "not recorded"
  const delta = lastOdometer - startOdometer;
  if (delta < 0) return null;
  if (delta > 5_000) return null; // no road vehicle covers 5,000 km in one trip
  return delta;
}

function finalise(
  open: OpenTrip,
  endAt: Date,
  endReason: DetectedTrip['endReason'],
  config: TripDetectionConfig
): DetectedTrip | null {
  const durationMinutes = Math.max(0, minutesBetween(open.startAt, endAt));

  const fromOdometer = odometerDelta(open);
  let distanceKm: number | null = null;
  let distanceSource: DetectedTrip['distanceSource'] = null;

  if (fromOdometer !== null && fromOdometer > 0) {
    // Preferred: the vehicle's own instrument, not our reconstruction.
    distanceKm = fromOdometer;
    distanceSource = 'odometer';
  } else if (open.pathKm > 0) {
    distanceKm = open.pathKm;
    distanceSource = 'gps-path';
  }

  // Discard only when the segment fails BOTH tests -- see the config's
  // doc comment for why either one alone is a real trip.
  const tooShortInTime = durationMinutes < config.minTripMinutes;
  const tooShortInDistance = distanceKm === null || distanceKm < config.minTripKm;
  if (tooShortInTime && tooShortInDistance) return null;

  const averageSpeedKmh =
    distanceKm !== null && durationMinutes > 0
      ? (distanceKm / durationMinutes) * 60
      : null;

  return {
    startAt: open.startAt,
    endAt,
    startLat: open.startLat,
    startLng: open.startLng,
    endLat: open.lastLat,
    endLng: open.lastLng,
    durationMinutes,
    distanceKm,
    distanceSource,
    maxSpeedKmh: open.maxSpeedKmh > 0 ? open.maxSpeedKmh : null,
    averageSpeedKmh,
    readingCount: open.readingCount,
    endReason,
  };
}

function openFrom(r: DetectionReading): OpenTrip {
  return {
    startAt: r.timestamp,
    startLat: r.lat,
    startLng: r.lng,
    startOdometer: typeof r.odometer === 'number' && r.odometer > 0 ? r.odometer : undefined,
    lastAt: r.timestamp,
    lastLat: r.lat,
    lastLng: r.lng,
    lastOdometer: typeof r.odometer === 'number' && r.odometer > 0 ? r.odometer : undefined,
    lastMovingAt: r.timestamp,
    pathKm: 0,
    maxSpeedKmh: typeof r.speed === 'number' ? r.speed : 0,
    readingCount: 1,
  };
}

export interface DetectionResult {
  trips: DetectedTrip[];
  state: TripDetectionState;
}

/**
 * Runs detection over `readings`, continuing from `priorState`.
 *
 * `readings` MUST be in ascending timestamp order; the caller sorts.
 * Readings at or before `priorState.lastProcessedAt` are skipped, which
 * is what makes re-running the sweep over an overlapping window
 * idempotent rather than duplicating.
 *
 * A KNOWN LIMITATION, stated rather than hidden: distance covered
 * DURING a signal gap is unattributable -- we cannot know when it
 * happened or whether the vehicle stopped in between -- so it is not
 * counted toward either the closed trip or the next one. A fleet with
 * chronic coverage gaps will therefore under-report distance from
 * telemetry. Odometer-based distance on the following trip picks most of
 * it back up, which is one more reason odometer is preferred over the
 * GPS path.
 *
 * The returned state carries any still-open trip forward. An open trip
 * is deliberately NOT emitted: a trip that has not ended has no end
 * time, no duration and no final distance, and writing a provisional row
 * that later changes would put a moving target into the allocation
 * ledger.
 */
export function detectTrips(
  readings: DetectionReading[],
  priorState: TripDetectionState,
  config: TripDetectionConfig = DEFAULT_TRIP_DETECTION_CONFIG
): DetectionResult {
  const trips: DetectedTrip[] = [];
  let open: OpenTrip | null = priorState.open;
  let lastProcessedAt = priorState.lastProcessedAt;

  for (const reading of readings) {
    // Watermark: never reprocess. This is the idempotency guarantee.
    if (lastProcessedAt && reading.timestamp <= lastProcessedAt) continue;

    const moving = isMoving(reading, config);

    if (open) {
      // --- signal gap: the device went dark, so close at the last fix ---
      if (minutesBetween(open.lastAt, reading.timestamp) > config.signalGapMinutes) {
        const trip = finalise(open, open.lastAt, 'signal-gap', config);
        if (trip) trips.push(trip);
        open = moving ? openFrom(reading) : null;
        lastProcessedAt = reading.timestamp;
        continue;
      }

      // --- accumulate before any close, so the closing fix counts ---
      if (hasFix(reading) && typeof open.lastLat === 'number' && typeof open.lastLng === 'number') {
        open.pathKm += haversineKm(
          { lat: open.lastLat, lng: open.lastLng },
          { lat: reading.lat, lng: reading.lng }
        );
      }
      if (typeof reading.speed === 'number' && reading.speed > open.maxSpeedKmh) {
        open.maxSpeedKmh = reading.speed;
      }
      if (typeof reading.odometer === 'number' && reading.odometer > 0) {
        open.lastOdometer = reading.odometer;
      }
      if (hasFix(reading)) {
        open.lastLat = reading.lat;
        open.lastLng = reading.lng;
      }
      open.lastAt = reading.timestamp;
      open.readingCount += 1;
      if (moving) open.lastMovingAt = reading.timestamp;

      // --- ignition off is decisive and needs no timeout ---
      if (reading.ignition === false) {
        const trip = finalise(open, reading.timestamp, 'ignition-off', config);
        if (trip) trips.push(trip);
        open = null;
        lastProcessedAt = reading.timestamp;
        continue;
      }

      // --- sustained stop ---
      if (!moving && minutesBetween(open.lastMovingAt, reading.timestamp) >= config.stopMinutes) {
        // Ends at the last time it was actually MOVING, not now: the
        // intervening stationary minutes are not part of the journey and
        // would deflate average speed and inflate duration.
        const endAt = open.lastMovingAt;
        const trimmed: OpenTrip = { ...open, lastAt: endAt };
        const trip = finalise(trimmed, endAt, 'stopped', config);
        if (trip) trips.push(trip);
        open = null;
        lastProcessedAt = reading.timestamp;
        continue;
      }
    } else if (moving) {
      open = openFrom(reading);
    }

    lastProcessedAt = reading.timestamp;
  }

  return { trips, state: { open, lastProcessedAt } };
}

/**
 * Deterministic identity for a generated trip.
 *
 * Two runs over the same readings must produce the same key, and a key
 * must never collide with another vehicle's or another tenant's. Start
 * time is the discriminator because a vehicle cannot begin two trips at
 * the same instant.
 *
 * Millisecond precision deliberately: truncating to the second would let
 * a re-run that recomputed a start time 400 ms earlier write a second
 * row for the same journey.
 */
export function tripGenerationKey(
  tenantId: string,
  vehicleId: string,
  startAt: Date
): string {
  return `${tenantId}:${vehicleId}:${startAt.toISOString()}`;
}
