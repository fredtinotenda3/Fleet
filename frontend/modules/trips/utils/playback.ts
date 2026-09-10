// frontend/modules/trips/utils/playback.ts
//
// The arithmetic behind trip playback, kept out of the component.
//
// Jest runs `testEnvironment: 'node'` with no jsdom, so anything decided
// inside a React component cannot be tested. Every decision that could
// be WRONG rather than merely ugly lives here: where the marker sits at
// a given moment, what speed to show, and what to do at the ends of the
// track.
//
// ---------------------------------------------------------------------
// THE RULE INHERITED FROM THE LIVE MAP: NEVER EXTRAPOLATE
// ---------------------------------------------------------------------
// marker-interpolation.ts is emphatic that a marker eases to the last
// KNOWN fix and stops, because dead reckoning draws a vehicle somewhere
// the platform has no evidence it has been, rendered identically to a
// measured position.
//
// Playback interpolates BETWEEN two received fixes, which is a different
// claim and a defensible one: the vehicle was at A and then at B, so it
// was somewhere on that segment in between. It never runs past the last
// fix, and it never invents a fix before the first one -- both ends
// clamp.
//
// SPEED AND HEADING ARE NOT INTERPOLATED. A position between two fixes
// is a geometric consequence; a speed between two fixes is a guess about
// the throttle. The readout shows the last REPORTED value, and shows
// nothing at all when the reading did not carry one -- `speed: 0` reads
// as stationary and `heading: 0` points due north, which is why the
// server refuses to default them either.

/** One sample on the track, as it arrives over the wire. */
export interface TripPlaybackPoint {
  /** Milliseconds since the trip started. What the scrubber seeks on. */
  offsetMs: number;
  /** ISO-8601. `Date` server-side; a string by the time it is here. */
  timestamp: string;
  lat: number;
  lng: number;
  /** km/h. Absent when the reading did not report it. */
  speed?: number;
  /** Compass degrees. Absent when unreported -- 0 is due north, not "unknown". */
  heading?: number;
}

export interface TripPlaybackData {
  tripId: string;
  licensePlate: string;
  vehicleId: string | null;
  startTime: string | null;
  endTime: string | null;
  durationMs: number;
  points: TripPlaybackPoint[];
  downsampled: boolean;
  sourceReadingCount: number;
  emptyReason?: 'no-time-window' | 'no-vehicle-reference' | 'no-readings';
}

export interface PlaybackFrame {
  lat: number;
  lng: number;
  /** Index of the reading at or before this offset. */
  index: number;
  /** The last REPORTED speed, never interpolated. */
  speed?: number;
  /** The last REPORTED heading, never interpolated. */
  heading?: number;
  /** ISO timestamp of the reading this frame is derived from. */
  timestamp: string;
  /** True when the position sits between two readings rather than on one. */
  interpolated: boolean;
}

/**
 * Where the vehicle was at `offsetMs`.
 *
 * Returns null only for an empty track -- every other input clamps, so a
 * scrubber dragged past either end rests on a real fix rather than
 * disappearing or drawing a position nobody measured.
 */
export function frameAtOffset(
  points: readonly TripPlaybackPoint[],
  offsetMs: number
): PlaybackFrame | null {
  if (points.length === 0) return null;

  const first = points[0];
  const last = points[points.length - 1];

  // Before the first fix. `points[0].offsetMs` is not necessarily 0 --
  // the first reading can lag the trip's recorded start time, and
  // pretending otherwise would draw the vehicle at the start line for a
  // period in which nothing was reported.
  if (offsetMs <= first.offsetMs) {
    return frameFrom(first, 0, false);
  }
  if (offsetMs >= last.offsetMs) {
    return frameFrom(last, points.length - 1, false);
  }

  const index = lastIndexAtOrBefore(points, offsetMs);
  const from = points[index];
  const to = points[index + 1];

  const span = to.offsetMs - from.offsetMs;
  // Two readings sharing an offset would divide by zero. The unique
  // telemetry index makes it unlikely, not impossible -- an import can
  // produce it.
  const progress = span > 0 ? (offsetMs - from.offsetMs) / span : 0;

  return {
    lat: from.lat + (to.lat - from.lat) * progress,
    lng: from.lng + (to.lng - from.lng) * progress,
    index,
    // From `from`, not blended with `to`: these are measurements, not
    // geometry. See the header.
    ...(typeof from.speed === 'number' ? { speed: from.speed } : {}),
    ...(typeof from.heading === 'number' ? { heading: from.heading } : {}),
    timestamp: from.timestamp,
    interpolated: progress > 0,
  };
}

function frameFrom(point: TripPlaybackPoint, index: number, interpolated: boolean): PlaybackFrame {
  return {
    lat: point.lat,
    lng: point.lng,
    index,
    ...(typeof point.speed === 'number' ? { speed: point.speed } : {}),
    ...(typeof point.heading === 'number' ? { heading: point.heading } : {}),
    timestamp: point.timestamp,
    interpolated,
  };
}

/**
 * Index of the last reading at or before `offsetMs`.
 *
 * Binary search rather than a scan: the track is capped at 1,500 points
 * and this runs once per animation frame, so a linear scan would be
 * 90,000 comparisons a second for no reason.
 */
export function lastIndexAtOrBefore(
  points: readonly TripPlaybackPoint[],
  offsetMs: number
): number {
  let low = 0;
  let high = points.length - 1;
  let answer = 0;

  while (low <= high) {
    const mid = (low + high) >> 1;
    if (points[mid].offsetMs <= offsetMs) {
      answer = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return answer;
}

/** The offset range a scrubber may seek over. */
export function playbackRange(points: readonly TripPlaybackPoint[]): { min: number; max: number } {
  if (points.length === 0) return { min: 0, max: 0 };
  return { min: points[0].offsetMs, max: points[points.length - 1].offsetMs };
}

/** Every position on the track, for the route polyline. */
export function playbackPath(
  points: readonly TripPlaybackPoint[]
): Array<[number, number]> {
  return points.map((p) => [p.lat, p.lng]);
}

/**
 * `h:mm:ss` elapsed, or `mm:ss` under an hour.
 *
 * Not a date format: this is a position within the trip, and rendering
 * it as a clock time would make a scrubber at 00:00 look like midnight.
 */
export function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

/** Playback speeds offered by the transport controls. */
export const PLAYBACK_SPEEDS = [1, 2, 4, 8, 16] as const;
export type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number];

/**
 * How far playback should advance for a real-time delta.
 *
 * Separated out so the multiplier is testable: a playback clock that
 * drifts from the scrubber is the kind of bug that only shows up on a
 * three-hour trip.
 */
export function advanceOffset(
  currentOffsetMs: number,
  elapsedRealMs: number,
  speed: PlaybackSpeed,
  maxOffsetMs: number
): { offsetMs: number; ended: boolean } {
  const next = currentOffsetMs + elapsedRealMs * speed;
  if (next >= maxOffsetMs) return { offsetMs: maxOffsetMs, ended: true };
  return { offsetMs: next, ended: false };
}

/** What to tell the operator when there is no track. */
export const EMPTY_REASON_COPY: Record<
  NonNullable<TripPlaybackData['emptyReason']>,
  { title: string; description: string }
> = {
  'no-time-window': {
    title: 'This trip has no start and end time',
    description:
      'A manually entered trip carries a date but no clock times, so there is no window of telemetry to replay. Trips generated from telematics always have one.',
  },
  'no-vehicle-reference': {
    title: "This trip's vehicle could not be resolved",
    description:
      'The trip names a license plate that no longer matches a vehicle, so there is no device history to look up. Check the plate on the trip record.',
  },
  'no-readings': {
    title: 'No telemetry was recorded during this trip',
    description:
      'The vehicle reported no positions between the start and end times. This is normal for a trip entered by hand, or for a period when the tracker was offline.',
  },
};
