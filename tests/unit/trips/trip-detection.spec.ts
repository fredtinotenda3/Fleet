// tests/unit/trips/trip-detection.spec.ts
//
// The detector is pure, so its boundary conditions can be tested
// exhaustively without a database. Those boundaries are the whole
// problem: a device going dark mid-journey, a truck idling at a depot,
// an odometer that jumps backwards, a re-run over overlapping readings.

import {
  detectTrips,
  haversineKm,
  tripGenerationKey,
  DEFAULT_TRIP_DETECTION_CONFIG,
  DetectionReading,
  TripDetectionState,
} from '../../../modules/trips/services/trip-detection';

const EMPTY: TripDetectionState = { open: null, lastProcessedAt: null };

/** Minutes after a fixed epoch, so every fixture is readable. */
const T0 = Date.UTC(2026, 8, 1, 6, 0, 0);
const at = (minutes: number) => new Date(T0 + minutes * 60_000);

/** Harare depot, and a point ~1 km north of it. */
const DEPOT = { lat: -17.82, lng: 31.05 };
const northOf = (km: number) => ({ lat: DEPOT.lat + km / 111.32, lng: DEPOT.lng });

function reading(minutes: number, over: Partial<DetectionReading> = {}): DetectionReading {
  return { timestamp: at(minutes), speed: 0, ...DEPOT, ...over };
}

describe('haversineKm', () => {
  it('measures a known short distance', () => {
    expect(haversineKm(DEPOT, northOf(1))).toBeCloseTo(1, 1);
  });

  it('is zero for the same point', () => {
    expect(haversineKm(DEPOT, DEPOT)).toBe(0);
  });
});

describe('detectTrips: ignition is authoritative when reported', () => {
  it('starts on movement and ends the instant ignition goes off', () => {
    const readings: DetectionReading[] = [
      reading(0, { ignition: true, speed: 0, odometer: 84_300 }),
      reading(1, { ignition: true, speed: 40, odometer: 84_301, ...northOf(1) }),
      reading(10, { ignition: true, speed: 60, odometer: 84_312, ...northOf(12) }),
      reading(20, { ignition: false, speed: 0, odometer: 84_320, ...northOf(20) }),
    ];

    const { trips, state } = detectTrips(readings, EMPTY);

    expect(trips).toHaveLength(1);
    expect(trips[0].endReason).toBe('ignition-off');
    expect(trips[0].startAt).toEqual(at(1)); // first MOVING reading, not the parked one
    expect(trips[0].endAt).toEqual(at(20));
    expect(trips[0].durationMinutes).toBe(19);
    expect(state.open).toBeNull();
  });

  it('does not need a stop timeout when ignition reports off', () => {
    // A trip ending on ignition must not wait out stopMinutes -- the
    // engine is off, which is decisive.
    const readings: DetectionReading[] = [
      reading(0, { ignition: true, speed: 50, odometer: 100 }),
      reading(1, { ignition: false, speed: 0, odometer: 103, ...northOf(3) }),
    ];
    const { trips } = detectTrips(readings, EMPTY);
    expect(trips).toHaveLength(1);
    expect(trips[0].endReason).toBe('ignition-off');
  });

  it('REGRESSION: an idling vehicle is not on a trip', () => {
    // Ignition on, speed zero, for an hour. Treating ignition as motion
    // produces a 60-minute trip covering zero kilometres, which then
    // drags fleet average speed and cost-per-km toward nonsense.
    const readings = Array.from({ length: 60 }, (_, i) =>
      reading(i, { ignition: true, speed: 0, odometer: 84_300 })
    );
    const { trips, state } = detectTrips(readings, EMPTY);
    expect(trips).toEqual([]);
    expect(state.open).toBeNull();
  });

  it('treats absent ignition as unreported, not as off', () => {
    // An HTTP-ingest device reporting no ignition at all must still
    // produce trips. Treating undefined as false ends every trip on its
    // first reading.
    const readings: DetectionReading[] = [
      reading(0, { speed: 45, odometer: 500 }),
      reading(5, { speed: 50, odometer: 505, ...northOf(5) }),
      reading(10, { speed: 0 }),
      reading(16, { speed: 0 }),
    ];
    const { trips } = detectTrips(readings, EMPTY);
    expect(trips).toHaveLength(1);
    expect(trips[0].endReason).toBe('stopped');
  });
});

describe('detectTrips: movement fallback and stop detection', () => {
  it('ends a trip after a sustained stop, dated to the last movement', () => {
    // The stationary minutes are not part of the journey. Ending "now"
    // would inflate duration and deflate average speed by the length of
    // the stop.
    const readings: DetectionReading[] = [
      reading(0, { speed: 60, odometer: 1_000 }),
      reading(10, { speed: 60, odometer: 1_012, ...northOf(12) }),
      reading(11, { speed: 0, ...northOf(12) }),
      reading(20, { speed: 0, ...northOf(12) }),
    ];
    const { trips } = detectTrips(readings, EMPTY);

    expect(trips).toHaveLength(1);
    expect(trips[0].endAt).toEqual(at(10));
    expect(trips[0].durationMinutes).toBe(10);
  });

  it('does not end a trip on a brief stop below the threshold', () => {
    // A traffic light is not the end of a delivery run.
    const readings: DetectionReading[] = [
      reading(0, { speed: 50, odometer: 1_000 }),
      reading(2, { speed: 0 }),
      reading(4, { speed: 55, ...northOf(4) }),
      reading(30, { speed: 55, odometer: 1_040, ...northOf(40) }),
      reading(40, { speed: 0, ...northOf(40) }),
      reading(50, { speed: 0, ...northOf(40) }),
    ];
    const { trips } = detectTrips(readings, EMPTY);

    expect(trips).toHaveLength(1);
    expect(trips[0].startAt).toEqual(at(0));
    expect(trips[0].endAt).toEqual(at(30));
  });

  it('ignores GPS jitter on a parked vehicle', () => {
    // Stationary GPS routinely reports 1-3 km/h. A zero threshold turns
    // an overnight park into hundreds of one-minute trips.
    const readings = Array.from({ length: 120 }, (_, i) =>
      reading(i, { speed: i % 3, ...DEPOT })
    );
    const { trips } = detectTrips(readings, EMPTY);
    expect(trips).toEqual([]);
  });

  it('REGRESSION: an ordinary 30-minute reporting cadence is not a signal gap', () => {
    // The first cut set signalGapMinutes to 30, so a tracker reporting
    // every 30 minutes gap-closed on EVERY reading. Each stub then
    // failed the minimum-trip test and was discarded, so a full day of
    // driving produced zero trips -- silence, not a wrong answer.
    const readings: DetectionReading[] = [
      reading(0, { speed: 50, odometer: 1_000 }),
      reading(30, { speed: 50, odometer: 1_030, ...northOf(30) }),
      reading(60, { speed: 0, ...northOf(30) }),
      reading(70, { speed: 0, ...northOf(30) }),
    ];
    const { trips } = detectTrips(readings, EMPTY);
    expect(trips).toHaveLength(1);
    expect(trips[0].endReason).toBe('stopped');
    expect(trips[0].distanceKm).toBeCloseTo(30, 5);
  });

  it('produces two trips for two separate runs in a day', () => {
    const readings: DetectionReading[] = [
      reading(0, { speed: 50, odometer: 1_000 }),
      reading(30, { speed: 50, odometer: 1_030, ...northOf(30) }),
      reading(31, { speed: 0, ...northOf(30) }),
      reading(45, { speed: 0, ...northOf(30) }), // long stop -> trip 1 ends
      reading(120, { speed: 50, odometer: 1_100, ...northOf(30) }),
      reading(150, { speed: 50, odometer: 1_130, ...northOf(60) }),
      reading(151, { speed: 0, ...northOf(60) }),
      reading(165, { speed: 0, ...northOf(60) }),
    ];
    const { trips } = detectTrips(readings, EMPTY);
    expect(trips).toHaveLength(2);
    expect(trips[0].endAt).toEqual(at(30));
    expect(trips[1].startAt).toEqual(at(120));
  });
});

describe('detectTrips: a device going dark', () => {
  it('closes the trip at the last reading, not across the silence', () => {
    // Six hours of nothing is not a six-hour trip.
    const readings: DetectionReading[] = [
      reading(0, { speed: 60, odometer: 2_000 }),
      reading(10, { speed: 60, odometer: 2_015, ...northOf(15) }),
      reading(370, { speed: 60, odometer: 2_400, ...northOf(400) }), // 6h later
    ];
    const { trips, state } = detectTrips(readings, EMPTY);

    expect(trips).toHaveLength(1);
    expect(trips[0].endReason).toBe('signal-gap');
    expect(trips[0].endAt).toEqual(at(10));
    expect(trips[0].durationMinutes).toBe(10);
    // The reading after the gap starts a fresh trip.
    expect(state.open?.startAt).toEqual(at(370));
  });
});

describe('detectTrips: distance', () => {
  it('prefers the odometer over the reconstructed GPS path', () => {
    // The vehicle's own instrument beats our great-circle approximation,
    // which under-reads on any road that is not a straight line.
    const readings: DetectionReading[] = [
      reading(0, { speed: 50, odometer: 10_000 }),
      reading(20, { speed: 50, odometer: 10_030, ...northOf(25) }),
      reading(21, { speed: 0, ...northOf(25) }),
      reading(30, { speed: 0, ...northOf(25) }),
    ];
    const { trips } = detectTrips(readings, EMPTY);
    expect(trips[0].distanceKm).toBeCloseTo(30, 5);
    expect(trips[0].distanceSource).toBe('odometer');
  });

  it('falls back to the GPS path when no odometer is reported', () => {
    const readings: DetectionReading[] = [
      reading(0, { speed: 50 }),
      reading(20, { speed: 50, ...northOf(10) }),
      reading(21, { speed: 0, ...northOf(10) }),
      reading(30, { speed: 0, ...northOf(10) }),
    ];
    const { trips } = detectTrips(readings, EMPTY);
    expect(trips[0].distanceSource).toBe('gps-path');
    expect(trips[0].distanceKm).toBeCloseTo(10, 0);
  });

  it('REGRESSION: odometer 0 means "not recorded", not kilometre zero', () => {
    // Real fuel rows in this deployment carry odometer: 0. If telemetry
    // does the same, treating it as a reading makes the delta equal the
    // vehicle's entire lifetime mileage.
    const readings: DetectionReading[] = [
      reading(0, { speed: 50, odometer: 0 }),
      reading(20, { speed: 50, odometer: 84_500, ...northOf(10) }),
      reading(21, { speed: 0, ...northOf(10) }),
      reading(30, { speed: 0, ...northOf(10) }),
    ];
    const { trips } = detectTrips(readings, EMPTY);
    expect(trips[0].distanceSource).toBe('gps-path');
    expect(trips[0].distanceKm).toBeLessThan(20);
  });

  it('rejects a backwards odometer rather than posting a negative distance', () => {
    const readings: DetectionReading[] = [
      reading(0, { speed: 50, odometer: 84_500 }),
      reading(20, { speed: 50, odometer: 84_100, ...northOf(10) }),
      reading(21, { speed: 0, ...northOf(10) }),
      reading(30, { speed: 0, ...northOf(10) }),
    ];
    const { trips } = detectTrips(readings, EMPTY);
    expect(trips[0].distanceKm).not.toBeNull();
    expect(trips[0].distanceKm!).toBeGreaterThan(0);
    expect(trips[0].distanceSource).toBe('gps-path');
  });

  it('rejects an absurd odometer jump', () => {
    // A replaced or misreported unit must not post a 100,000 km trip.
    const readings: DetectionReading[] = [
      reading(0, { speed: 50, odometer: 100 }),
      reading(20, { speed: 50, odometer: 100_000, ...northOf(10) }),
      reading(21, { speed: 0, ...northOf(10) }),
      reading(30, { speed: 0, ...northOf(10) }),
    ];
    const { trips } = detectTrips(readings, EMPTY);
    expect(trips[0].distanceSource).toBe('gps-path');
  });

  it('reports distance as null, never 0, when it cannot be established', () => {
    // No odometer and no GPS fixes. `0` here would read as "this vehicle
    // moved nowhere" and would corrupt cost-per-km.
    const readings: DetectionReading[] = [
      { timestamp: at(0), speed: 50 },
      { timestamp: at(20), speed: 50 },
      { timestamp: at(21), speed: 0 },
      { timestamp: at(30), speed: 0 },
    ];
    const { trips } = detectTrips(readings, EMPTY);
    expect(trips).toHaveLength(1);
    expect(trips[0].distanceKm).toBeNull();
    expect(trips[0].distanceSource).toBeNull();
    expect(trips[0].averageSpeedKmh).toBeNull();
  });
});

describe('detectTrips: noise rejection', () => {
  it('discards a segment that is short in BOTH time and distance', () => {
    const readings: DetectionReading[] = [
      reading(0, { speed: 20, odometer: 500 }),
      reading(0.5, { speed: 20, odometer: 500.1 }),
      reading(1, { speed: 0 }),
      reading(10, { speed: 0 }),
    ];
    const { trips } = detectTrips(readings, EMPTY);
    expect(trips).toEqual([]);
  });

  it('keeps a short-in-time but long-in-distance segment', () => {
    // 3 km in 90 seconds is a real movement.
    const readings: DetectionReading[] = [
      reading(0, { speed: 90, odometer: 500 }),
      reading(1.5, { speed: 90, odometer: 503 }),
      reading(2, { speed: 0 }),
      reading(12, { speed: 0 }),
    ];
    const { trips } = detectTrips(readings, EMPTY);
    expect(trips).toHaveLength(1);
    expect(trips[0].distanceKm).toBeCloseTo(3, 5);
  });

  it('keeps a long-in-time but short-in-distance segment', () => {
    // 400 m of crawling traffic over 20 minutes is also real.
    const readings: DetectionReading[] = [
      reading(0, { speed: 6, odometer: 500 }),
      reading(20, { speed: 6, odometer: 500.4 }),
      reading(21, { speed: 0 }),
      reading(31, { speed: 0 }),
    ];
    const { trips } = detectTrips(readings, EMPTY);
    expect(trips).toHaveLength(1);
  });
});

describe('detectTrips: idempotency and resumption', () => {
  const journey: DetectionReading[] = [
    reading(0, { speed: 50, odometer: 1_000 }),
    reading(10, { speed: 50, odometer: 1_012, ...northOf(12) }),
    reading(11, { speed: 0, ...northOf(12) }),
    reading(20, { speed: 0, ...northOf(12) }),
  ];

  it('re-running over the same readings produces no additional trips', () => {
    // The watermark is what makes the scheduled sweep safe to overlap.
    const first = detectTrips(journey, EMPTY);
    expect(first.trips).toHaveLength(1);

    const second = detectTrips(journey, first.state);
    expect(second.trips).toEqual([]);
  });

  it('re-running over an OVERLAPPING window produces no duplicates', () => {
    // The shell deliberately re-reads a margin before the watermark so a
    // late-arriving reading is not lost; that overlap must be harmless.
    const first = detectTrips(journey.slice(0, 3), EMPTY);
    const second = detectTrips(journey, first.state);
    const all = [...first.trips, ...second.trips];
    expect(all).toHaveLength(1);
  });

  it('carries an open trip across batches and closes it in the next', () => {
    const batchOne = detectTrips(journey.slice(0, 2), EMPTY);
    expect(batchOne.trips).toEqual([]);
    expect(batchOne.state.open).not.toBeNull();

    const batchTwo = detectTrips(journey.slice(2), batchOne.state);
    expect(batchTwo.trips).toHaveLength(1);
    expect(batchTwo.trips[0].startAt).toEqual(at(0));
    expect(batchTwo.trips[0].endAt).toEqual(at(10));
  });

  it('never emits a still-open trip', () => {
    // A trip with no end has no duration and no final distance. Writing
    // a provisional row that later changes would put a moving target
    // into the allocation ledger.
    const { trips, state } = detectTrips(journey.slice(0, 2), EMPTY);
    expect(trips).toEqual([]);
    expect(state.open).not.toBeNull();
  });

  it('advances the watermark to the last reading seen', () => {
    const { state } = detectTrips(journey, EMPTY);
    expect(state.lastProcessedAt).toEqual(at(20));
  });
});

describe('tripGenerationKey', () => {
  const start = at(0);

  it('is stable for the same journey', () => {
    expect(tripGenerationKey('t1', 'v1', start)).toBe(tripGenerationKey('t1', 'v1', start));
  });

  it('separates tenants', () => {
    expect(tripGenerationKey('t1', 'v1', start)).not.toBe(tripGenerationKey('t2', 'v1', start));
  });

  it('separates vehicles', () => {
    expect(tripGenerationKey('t1', 'v1', start)).not.toBe(tripGenerationKey('t1', 'v2', start));
  });

  it('keeps millisecond precision', () => {
    // Truncating to the second would let a re-run that recomputed a
    // start 400 ms earlier write a second row for the same journey.
    const a = tripGenerationKey('t1', 'v1', new Date(T0));
    const b = tripGenerationKey('t1', 'v1', new Date(T0 + 400));
    expect(a).not.toBe(b);
  });
});

describe('detectTrips: configuration is honoured', () => {
  it('a longer stop threshold merges what a shorter one splits', () => {
    // NOTE the reading at t=17, inside the stop. Detection is
    // reading-driven: a stop is only observable if a reading arrives
    // during it. Without that fix the two runs merge under BOTH
    // configurations, which is correct behaviour and not what this test
    // is about.
    const readings: DetectionReading[] = [
      reading(0, { speed: 50, odometer: 1_000 }),
      reading(10, { speed: 50, odometer: 1_012, ...northOf(12) }),
      reading(11, { speed: 0, ...northOf(12) }),
      reading(17, { speed: 0, ...northOf(12) }),
      reading(18, { speed: 50, odometer: 1_020, ...northOf(20) }),
      reading(30, { speed: 50, odometer: 1_035, ...northOf(35) }),
      reading(31, { speed: 0, ...northOf(35) }),
      reading(45, { speed: 0, ...northOf(35) }),
    ];

    const split = detectTrips(readings, EMPTY, DEFAULT_TRIP_DETECTION_CONFIG);
    expect(split.trips).toHaveLength(2);

    const merged = detectTrips(readings, EMPTY, {
      ...DEFAULT_TRIP_DETECTION_CONFIG,
      stopMinutes: 15,
    });
    expect(merged.trips).toHaveLength(1);
  });
});
