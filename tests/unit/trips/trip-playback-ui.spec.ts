// tests/unit/trips/trip-playback-ui.spec.ts
//
// The arithmetic behind the playback scrubber.
//
// Playback shows where a named vehicle was, minute by minute. The
// failure modes are not cosmetic: a playhead that runs past the last fix
// draws the vehicle somewhere the platform has no evidence it has been,
// and a blended speed asserts a measurement nobody took. Both would be
// rendered identically to the real thing.
//
// The component itself cannot be tested (jest runs `testEnvironment:
// 'node'` with no jsdom), so every decision that could be WRONG rather
// than merely ugly lives in the pure module this file covers.

import {
  advanceOffset,
  formatElapsed,
  frameAtOffset,
  lastIndexAtOrBefore,
  playbackPath,
  playbackRange,
  type TripPlaybackPoint,
} from '../../../frontend/modules/trips/utils/playback';

/** A three-point track: 0s, 10s, 20s, moving north-east. */
const TRACK: TripPlaybackPoint[] = [
  { offsetMs: 0, timestamp: '2026-09-01T06:00:00.000Z', lat: -17.8, lng: 31.0, speed: 0, heading: 90 },
  { offsetMs: 10_000, timestamp: '2026-09-01T06:00:10.000Z', lat: -17.7, lng: 31.1, speed: 40 },
  { offsetMs: 20_000, timestamp: '2026-09-01T06:00:20.000Z', lat: -17.6, lng: 31.2, speed: 60, heading: 45 },
];

describe('frameAtOffset', () => {
  it('sits exactly on a reading when the offset matches one', () => {
    const frame = frameAtOffset(TRACK, 10_000)!;
    expect(frame.lat).toBeCloseTo(-17.7, 10);
    expect(frame.lng).toBeCloseTo(31.1, 10);
    expect(frame.interpolated).toBe(false);
    expect(frame.index).toBe(1);
  });

  it('interpolates BETWEEN two readings', () => {
    // Halfway between fix 0 and fix 1. This is a geometric consequence
    // of two measurements, not a guess: the vehicle was at A and then at
    // B, so it was on that segment.
    const frame = frameAtOffset(TRACK, 5_000)!;
    expect(frame.lat).toBeCloseTo(-17.75, 10);
    expect(frame.lng).toBeCloseTo(31.05, 10);
    expect(frame.interpolated).toBe(true);
  });

  it('NEVER runs past the last fix', () => {
    // The rule inherited from the live map: a marker eases to the last
    // KNOWN position and stops. Extrapolating would draw the vehicle
    // somewhere nothing was ever recorded.
    const beyond = frameAtOffset(TRACK, 999_999)!;
    const last = TRACK[TRACK.length - 1];
    expect(beyond.lat).toBe(last.lat);
    expect(beyond.lng).toBe(last.lng);
    expect(beyond.interpolated).toBe(false);
  });

  it('never runs before the first fix either', () => {
    // points[0].offsetMs is not necessarily 0 -- the first reading can
    // lag the trip's recorded start. Clamping is honest; drawing the
    // vehicle at the start line for that gap is not.
    const before = frameAtOffset(TRACK, -50_000)!;
    expect(before.lat).toBe(TRACK[0].lat);
    expect(before.index).toBe(0);
  });

  it('does NOT blend speed between two readings', () => {
    // A position between two fixes is geometry. A speed between two
    // fixes is a guess about the throttle. Halfway between 0 km/h and
    // 40 km/h the honest answer is "the last reading said 0", not 20.
    const frame = frameAtOffset(TRACK, 5_000)!;
    expect(frame.speed).toBe(0);
  });

  it('reports no speed or heading when the reading carried none', () => {
    // `speed: 0` reads as stationary and `heading: 0` points due north.
    // The server refuses to default them; so does this.
    const frame = frameAtOffset(TRACK, 15_000)!;
    expect(frame.speed).toBe(40);
    expect(frame).not.toHaveProperty('heading');
  });

  it('returns null only for an empty track', () => {
    expect(frameAtOffset([], 0)).toBeNull();
  });

  it('handles a single-reading track without dividing by zero', () => {
    const single = [TRACK[0]];
    expect(frameAtOffset(single, 0)!.lat).toBe(TRACK[0].lat);
    expect(frameAtOffset(single, 99_999)!.lat).toBe(TRACK[0].lat);
  });

  it('survives two readings sharing an offset', () => {
    // The unique telemetry index makes this unlikely, not impossible --
    // an import can produce it, and the naive form divides by zero and
    // renders NaN coordinates, which Leaflet turns into a thrown error.
    const collided: TripPlaybackPoint[] = [
      { offsetMs: 0, timestamp: 'a', lat: 1, lng: 1 },
      { offsetMs: 5_000, timestamp: 'b', lat: 2, lng: 2 },
      { offsetMs: 5_000, timestamp: 'c', lat: 3, lng: 3 },
      { offsetMs: 9_000, timestamp: 'd', lat: 4, lng: 4 },
    ];
    for (const offset of [0, 2_500, 5_000, 7_000, 9_000]) {
      const frame = frameAtOffset(collided, offset)!;
      expect(Number.isFinite(frame.lat)).toBe(true);
      expect(Number.isFinite(frame.lng)).toBe(true);
    }
  });
});

describe('lastIndexAtOrBefore', () => {
  it('finds the bracketing reading', () => {
    expect(lastIndexAtOrBefore(TRACK, 0)).toBe(0);
    expect(lastIndexAtOrBefore(TRACK, 9_999)).toBe(0);
    expect(lastIndexAtOrBefore(TRACK, 10_000)).toBe(1);
    expect(lastIndexAtOrBefore(TRACK, 20_000)).toBe(2);
  });

  it('agrees with a linear scan across a long track', () => {
    // The binary search exists because this runs once per animation
    // frame on a track of up to 1,500 points. It has to be RIGHT, not
    // just fast, so it is checked against the obvious implementation.
    const long: TripPlaybackPoint[] = Array.from({ length: 500 }, (_, i) => ({
      offsetMs: i * 37,
      timestamp: `t${i}`,
      lat: i,
      lng: i,
    }));

    const scan = (offset: number) => {
      let answer = 0;
      for (let i = 0; i < long.length; i += 1) if (long[i].offsetMs <= offset) answer = i;
      return answer;
    };

    for (let offset = -10; offset < 500 * 37 + 50; offset += 13) {
      expect(lastIndexAtOrBefore(long, offset)).toBe(scan(offset));
    }
  });
});

describe('advanceOffset', () => {
  it('advances by real elapsed time multiplied by the chosen speed', () => {
    // Driven by wall-clock delta, not by a fixed step per frame: a fixed
    // step makes playback run at the display's refresh rate, so the same
    // trip plays at different speeds on two machines.
    expect(advanceOffset(0, 16, 1, 100_000).offsetMs).toBe(16);
    expect(advanceOffset(0, 16, 4, 100_000).offsetMs).toBe(64);
  });

  it('stops exactly at the end and reports it', () => {
    const result = advanceOffset(99_000, 1_000, 8, 100_000);
    expect(result.offsetMs).toBe(100_000);
    expect(result.ended).toBe(true);
  });

  it('cannot overshoot the end of the track', () => {
    // Overshooting would leave the scrubber past its own maximum, which
    // renders as a thumb outside the rail.
    for (const speed of [1, 2, 4, 8, 16] as const) {
      expect(advanceOffset(0, 1_000_000, speed, 50_000).offsetMs).toBe(50_000);
    }
  });
});

describe('playbackRange and playbackPath', () => {
  it('spans the first and last reading, not 0 to duration', () => {
    // The trip's recorded duration and the span of its TELEMETRY are
    // different numbers. Seeking over the trip duration would park the
    // playhead in periods with no readings at either end.
    expect(playbackRange(TRACK)).toEqual({ min: 0, max: 20_000 });
    expect(playbackRange([{ offsetMs: 4_000, timestamp: 't', lat: 1, lng: 1 }])).toEqual({
      min: 4_000,
      max: 4_000,
    });
  });

  it('is a safe zero range for an empty track', () => {
    expect(playbackRange([])).toEqual({ min: 0, max: 0 });
  });

  it('produces lat/lng pairs in track order', () => {
    expect(playbackPath(TRACK)).toEqual([
      [-17.8, 31.0],
      [-17.7, 31.1],
      [-17.6, 31.2],
    ]);
  });
});

describe('formatElapsed', () => {
  it('reads as elapsed time, not as a clock time', () => {
    // `00:00` rendered as a date would look like midnight.
    expect(formatElapsed(0)).toBe('0:00');
    expect(formatElapsed(65_000)).toBe('1:05');
    expect(formatElapsed(3_725_000)).toBe('1:02:05');
  });

  it('never renders a negative duration', () => {
    expect(formatElapsed(-5_000)).toBe('0:00');
  });
});
