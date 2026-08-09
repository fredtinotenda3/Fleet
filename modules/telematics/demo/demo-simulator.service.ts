// modules/telematics/demo/demo-simulator.service.ts
//
// Generates realistic-looking simulated GPS movement for Demo Mode.
//
// Design goal: a vehicle's simulated position must be a PURE function of
// (vehicleId, elapsedSecondsSinceDemoStart) -- no per-tick state to
// persist, no timer/interval to keep alive. That means:
//   - it works immediately on the very first request, no warm-up job
//   - it produces identical results across serverless instances/regions
//   - polling it twice a second apart just advances time, exactly like
//     a real GPS feed would
//
// Each vehicle is deterministically assigned a loop route (a circle
// around a point near the depot) from a hash of its own id, so the
// fleet spreads out realistically rather than every vehicle tracing the
// same path. Motion is genuine circular parametric motion, so speed and
// heading are the true instantaneous derivatives of the position
// function, not independently-faked values -- which is what makes the
// simulated "route history" (vehicles ingested through the same
// tbltelematics pipeline real Cartrack data uses) look coherent when
// played back.

export interface SimulatedVehicleState {
  lat: number;
  lng: number;
  /** km/h */
  speed: number;
  /** compass degrees, 0-360, 0 = north */
  heading: number;
  fuelLevel: number;
  odometerKm: number;
  ignitionOn: boolean;
  status: 'moving' | 'idle' | 'stopped';
}

export interface DemoDepot {
  lat: number;
  lng: number;
}

/** Harare, Zimbabwe -- a reasonable default depot centre for a fleet with no real location data yet. Override with DEMO_MODE_CENTER_LAT/LNG. */
export const DEFAULT_DEMO_DEPOT: DemoDepot = {
  lat: Number(process.env.DEMO_MODE_CENTER_LAT ?? -17.8252),
  lng: Number(process.env.DEMO_MODE_CENTER_LNG ?? 31.0335),
};

const KM_PER_DEGREE_LAT = 111.32;

const BASE_SPEED_KMH = 45;
const MIN_RADIUS_KM = 1.5;
const MAX_RADIUS_KM = 9;
const LOOP_PERIOD_SECONDS = 18 * 60; // ~18 minutes per full loop, varied per vehicle below
const TANK_RANGE_KM = 380; // distance between simulated refuels

/** Simple deterministic string hash -> unsigned 32-bit int. Not cryptographic; just needs to spread vehicle ids across the parameter space. */
function hashString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Maps a hash into [min, max). */
function scaledFromHash(hash: number, salt: number, min: number, max: number): number {
  const mixed = hashString(`${hash}:${salt}`);
  const unit = mixed / 0xffffffff;
  return min + unit * (max - min);
}

function kmToLatDegrees(km: number): number {
  return km / KM_PER_DEGREE_LAT;
}

function kmToLngDegrees(km: number, atLat: number): number {
  const kmPerDegreeLng = KM_PER_DEGREE_LAT * Math.cos((atLat * Math.PI) / 180);
  return km / Math.max(kmPerDegreeLng, 1);
}

/**
 * Computes a vehicle's simulated position, speed, heading, fuel and
 * odometer at a given moment. `elapsedSeconds` should be
 * (now - demoStartedAt) / 1000, clamped to >= 0 by the caller.
 */
export function simulateVehicleState(
  vehicleId: string,
  elapsedSeconds: number,
  depot: DemoDepot = DEFAULT_DEMO_DEPOT
): SimulatedVehicleState {
  const seed = hashString(vehicleId);

  // Spread each vehicle's loop centre a few km from the depot so the
  // fleet doesn't all orbit the exact same point.
  const centerOffsetKm = scaledFromHash(seed, 1, 0, 6);
  const centerBearing = scaledFromHash(seed, 2, 0, 2 * Math.PI);
  const centerLat = depot.lat + kmToLatDegrees(centerOffsetKm * Math.sin(centerBearing));
  const centerLng = depot.lng + kmToLngDegrees(centerOffsetKm * Math.cos(centerBearing), depot.lat);

  const radiusKm = scaledFromHash(seed, 3, MIN_RADIUS_KM, MAX_RADIUS_KM);
  const periodSeconds = LOOP_PERIOD_SECONDS * scaledFromHash(seed, 4, 0.6, 1.6);
  const angularSpeed = (2 * Math.PI) / periodSeconds;
  const direction = hashString(`${seed}:dir`) % 2 === 0 ? 1 : -1;
  const phase0 = scaledFromHash(seed, 5, 0, 2 * Math.PI);

  const angle = phase0 + direction * angularSpeed * elapsedSeconds;

  // Periodic idle windows: for roughly a third of each loop the vehicle
  // is stopped (deliveries, breaks) rather than moving, based purely on
  // where in the loop it currently is -- still a pure function of time.
  const idlePhase = Math.sin(angle * 3 + scaledFromHash(seed, 6, 0, 2 * Math.PI));
  const isIdleWindow = idlePhase < -0.55;

  const radiusLat = kmToLatDegrees(radiusKm);
  const radiusLng = kmToLngDegrees(radiusKm, centerLat);

  const lat = centerLat + radiusLat * Math.sin(angle);
  const lng = centerLng + radiusLng * Math.cos(angle);

  // True instantaneous velocity of the parametric circle, so heading
  // and speed agree with the actual path rather than being independently
  // randomized.
  const dLatDt = radiusLat * angularSpeed * direction * Math.cos(angle);
  const dLngDt = -radiusLng * angularSpeed * direction * Math.sin(angle);

  const headingRad = Math.atan2(dLngDt, dLatDt);
  const heading = (((headingRad * 180) / Math.PI) + 360) % 360;

  const speedVariation = scaledFromHash(seed, 7, 0.75, 1.25);
  const speed = isIdleWindow ? 0 : Math.round(BASE_SPEED_KMH * speedVariation * (0.7 + 0.3 * Math.abs(Math.cos(angle))));

  // Odometer: integral of speed over time, using the loop's average
  // speed as a stand-in (exact enough for a demo -- this isn't meant to
  // reconcile against the simulated distance travelled to the metre).
  const avgSpeedKmh = BASE_SPEED_KMH * speedVariation * 0.72;
  const totalKmTravelled = (avgSpeedKmh * elapsedSeconds) / 3600;
  const odometerBaseline = scaledFromHash(seed, 8, 8000, 120000);
  const odometerKm = Math.round(odometerBaseline + totalKmTravelled);

  // Fuel: sawtooth between 20% and 100%, "refuelling" every TANK_RANGE_KM.
  const distanceIntoTank = totalKmTravelled % TANK_RANGE_KM;
  const fuelLevel = Math.round(100 - (distanceIntoTank / TANK_RANGE_KM) * 80);

  return {
    lat,
    lng,
    speed,
    heading: Math.round(heading),
    fuelLevel,
    odometerKm,
    ignitionOn: !isIdleWindow,
    status: isIdleWindow ? 'idle' : 'moving',
  };
}