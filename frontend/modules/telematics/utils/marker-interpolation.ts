// frontend/modules/telematics/utils/marker-interpolation.ts
//
// Smooth marker movement between 10-second telemetry polls.
//
// ---------------------------------------------------------------------
// THE PROBLEM
// ---------------------------------------------------------------------
// The live map polls every 10 seconds and sets each marker to its new
// position. A vehicle at 60 km/h moves ~170 m in that interval, so every
// marker teleports once per poll. On a fleet map that reads as a glitch
// rather than as movement, and it makes it genuinely hard to tell which
// marker is which after a jump in a cluster.
//
// ---------------------------------------------------------------------
// WHAT THIS DOES, AND WHAT IT REFUSES TO DO
// ---------------------------------------------------------------------
// It eases each marker from where it was drawn to where the poll says it
// now is, over a fixed duration. That is all.
//
// IT IS EXPLICITLY NOT DEAD RECKONING. It never projects a vehicle
// forward past its last known position using speed and heading. That
// would put a marker somewhere the platform has no evidence the vehicle
// has been -- an invented position, rendered identically to a measured
// one. This codebase has been bitten repeatedly by fabricated values
// presented as measurements (the 0.0 km/L attention item, the summed
// odometers), and a moving dot is the most convincing fabrication
// available.
//
// So interpolation only ever runs BETWEEN two positions the platform
// actually received, and the marker arrives at the real fix and stops.
// It lags reality by up to one animation duration; it never leads it.
//
// ---------------------------------------------------------------------
// WHY LINEAR, AND WHY SHORTER THAN THE POLL INTERVAL
// ---------------------------------------------------------------------
// Linear because the vehicle's real path between two fixes is unknown --
// an eased curve would imply acceleration information that does not
// exist. Shorter than the poll interval (default 1.2s against a 10s
// poll) so the marker settles well before the next update: an animation
// still running when new data arrives would make the marker permanently
// chase a target it never reaches, which looks worse than teleporting.

/** A position the map can draw. */
export interface MarkerPosition {
  lat: number;
  lng: number;
}

/** Animation state for one marker. */
export interface InterpolationTrack {
  from: MarkerPosition;
  to: MarkerPosition;
  /** performance.now() at which the movement started. */
  startedAt: number;
  durationMs: number;
}

/**
 * Default animation length.
 *
 * Comfortably shorter than the 10s poll -- see the header. Long enough
 * to read as motion, short enough that the marker is at rest on the true
 * fix for most of each interval.
 */
export const DEFAULT_ANIMATION_MS = 1_200;

/**
 * Beyond this, snap instead of animating.
 *
 * A vehicle that appears 5 km from where it was is not a vehicle that
 * drove there in 10 seconds -- it is a device coming back online, a
 * corrected fix, or a GPS jump. Sliding a marker smoothly across 5 km of
 * map asserts a journey that did not happen, and takes the eye with it.
 * Snapping is the honest rendering of "this is somewhere else now".
 */
export const SNAP_DISTANCE_DEG = 0.05; // ~5.5 km of latitude

/**
 * Below this, do not animate at all.
 *
 * GPS jitter on a stationary vehicle moves the fix by a few metres every
 * poll. Animating that makes an entire parked fleet shimmer, which reads
 * as activity where there is none.
 */
export const IGNORE_DISTANCE_DEG = 0.00002; // ~2 m

/** Cheap planar distance. Real distances use haversine; this only ranks. */
export function approximateDegreeDistance(a: MarkerPosition, b: MarkerPosition): number {
  const dLat = a.lat - b.lat;
  const dLng = a.lng - b.lng;
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

/** Linear interpolation, clamped to [0, 1]. */
export function lerpPosition(
  from: MarkerPosition,
  to: MarkerPosition,
  progress: number
): MarkerPosition {
  const t = progress <= 0 ? 0 : progress >= 1 ? 1 : progress;
  return {
    lat: from.lat + (to.lat - from.lat) * t,
    lng: from.lng + (to.lng - from.lng) * t,
  };
}

/**
 * Decides what should happen when a new position arrives.
 *
 * Pure, so the policy -- snap vs animate vs ignore -- is testable
 * without a map, a browser or a clock.
 */
export function planMovement(
  current: MarkerPosition | undefined,
  next: MarkerPosition,
  options: { now: number; durationMs?: number }
): { action: 'snap'; to: MarkerPosition } | { action: 'ignore' } | { action: 'animate'; track: InterpolationTrack } {
  // First sight of a vehicle: place it, do not fly it in from nowhere.
  if (!current) return { action: 'snap', to: next };

  const distance = approximateDegreeDistance(current, next);

  if (distance < IGNORE_DISTANCE_DEG) return { action: 'ignore' };
  if (distance > SNAP_DISTANCE_DEG) return { action: 'snap', to: next };

  return {
    action: 'animate',
    track: {
      from: current,
      to: next,
      startedAt: options.now,
      durationMs: options.durationMs ?? DEFAULT_ANIMATION_MS,
    },
  };
}

/**
 * Position of a track at a given instant, and whether it has finished.
 *
 * Returns the exact target once complete rather than a value very close
 * to it, so a marker always comes to rest on the real fix.
 */
export function sampleTrack(
  track: InterpolationTrack,
  now: number
): { position: MarkerPosition; done: boolean } {
  const elapsed = now - track.startedAt;
  if (elapsed >= track.durationMs) return { position: track.to, done: true };
  if (elapsed <= 0) return { position: track.from, done: false };
  return { position: lerpPosition(track.from, track.to, elapsed / track.durationMs), done: false };
}

/**
 * Advances every track by one frame.
 *
 * ONE pass over all markers per frame, driven by a single
 * requestAnimationFrame in the component -- not a timer per marker. At
 * 500 vehicles that is the difference between one callback per frame and
 * five hundred, and the per-marker version is how a live map becomes
 * unusable on a fleet large enough to need one.
 *
 * Finished tracks are returned so the caller can drop them; a completed
 * track left in the map would be re-sampled forever.
 */
export function advanceTracks(
  tracks: Map<string, InterpolationTrack>,
  now: number
): { positions: Map<string, MarkerPosition>; finished: string[] } {
  const positions = new Map<string, MarkerPosition>();
  const finished: string[] = [];

  for (const [id, track] of tracks) {
    const { position, done } = sampleTrack(track, now);
    positions.set(id, position);
    if (done) finished.push(id);
  }

  return { positions, finished };
}
