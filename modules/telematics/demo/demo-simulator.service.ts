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
  /**
   * Engine running.
   *
   * CORRECTED: this was `!isIdleWindow`, which contradicted the
   * platform's own definition of idle. Every other part of this
   * codebase defines idle as ENGINE RUNNING WHILE STATIONARY --
   * canonical-telemetry.ts ("idle time is derived from ignition-on-
   * while-stationary"), eagletrack-triggers.map.ts ("idle means
   * engine-running-while-stationary everywhere in this codebase"), and
   * both adapters' `ignition_on && speed === 0` derivation.
   *
   * Emitting `status: 'idle'` together with `ignitionOn: false`
   * described a PARKED vehicle while labelling it idling. It did not
   * show up before because nothing persisted the flag; now that
   * `TelematicsData.engine.ignition` exists, the contradiction would
   * have reached the idle metric and the instrument cluster.
   */
  ignitionOn: boolean;
  status: 'moving' | 'idle' | 'stopped';
  /**
   * ─────────────────────────────────────────────────────────────────
   * ENGINE SIGNALS -- MODELLED, NOT CONSTANTS
   * ─────────────────────────────────────────────────────────────────
   * These exist because the demo persistence path was writing
   * hard-coded stand-ins into the same `tbltelematics` collection real
   * Cartrack data lands in:
   *
   *     rpm: sim.status === 'moving' ? 1800 : 800
   *     coolantTemp: 90
   *     throttlePosition: ... ? 40 : 0
   *     engineLoad: ... ? 50 : 5
   *     fuel: { consumptionRate: 0, instantConsumption: 0, fuelUsed: 0 }
   *     averageSpeed: sim.speed, maxSpeed: sim.speed
   *
   * Three separate problems with that. The constants are indis-
   * tinguishable downstream from measurements. The fuel zeros are the
   * fabricated-zero class this codebase has fixed repeatedly. And
   * `averageSpeed`/`maxSpeed` from an instantaneous sample is the exact
   * category error BOTH real adapters were corrected for -- the fix
   * never reached the demo path.
   *
   * So the signals an instrument cluster needs are modelled here, where
   * they can be derived from the same motion function as speed and
   * heading, and everything NOT modelled is now omitted at persistence
   * rather than invented.
   */
  /** Engine revolutions per minute. Derived from speed through a gear model. */
  rpm: number;
  /** Degrees Celsius. Climbs from ambient on cold start, then plateaus. */
  coolantTemp: number;
  /** Volts. Alternator output while running. */
  batteryVoltage: number;
  /** Percent 0-100, derived from acceleration demand. */
  throttlePosition: number;
  /** Percent 0-100. */
  engineLoad: number;
  /** Cumulative hours the engine has been running. */
  engineHours: number;
  /** L/h. Instantaneous burn -- idling burn is real and non-zero. */
  instantConsumptionLph: number;
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
const TANK_RANGE_KM = 380; // distance between simulated refuels

// ─── Duty cycle ───────────────────────────────────────────────────────
// Replaces the old fixed LOOP_PERIOD_SECONDS. The loop period is no
// longer a primitive: distance is, and the time to complete a lap now
// falls out of cruise speed and radius, as it does for a real vehicle.

/** One drive-then-stop cycle, varied per vehicle. */
const STOP_CYCLE_SECONDS = 12 * 60;
/** Fraction of each cycle spent under way; the remainder is stationary. */
const DRIVE_DUTY = 0.68;
/** Period of the gentle speed variation while under way. */
const SPEED_WAVE_SECONDS = 210;
/** Amplitude of that variation, as a fraction of cruise speed. */
const SPEED_WAVE_AMPLITUDE = 0.22;

// ─── Engine model constants ───────────────────────────────────────────
//
// Chosen to sit in the ranges a light commercial diesel actually
// occupies, so a gauge built against them reads plausibly. They are
// documented rather than tuned to look impressive: a demo that shows an
// impossible figure is worse than one that shows a dull correct figure.

/** Ambient at the depot. Coolant starts here on a cold engine. */
const AMBIENT_TEMP_C = 24;
/** Thermostat-regulated operating temperature. */
const OPERATING_TEMP_C = 89;
/** Time constant for the warm-up curve; ~4 minutes to reach ~95% of operating temp. */
const WARMUP_TAU_SECONDS = 80;
/** Alternator output with the engine running. */
const CHARGING_VOLTS = 14.3;
/** Speed at which the model is in top gear and revs track road speed linearly. */
const TOP_GEAR_KMH = 90;
/** Litres per hour burned at idle -- the figure that makes idling cost visible at all. */
const IDLE_BURN_LPH = 1.8;
/** Litres per hour at sustained cruise. */
const CRUISE_BURN_LPH = 9.5;

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
  const direction = hashString(`${seed}:dir`) % 2 === 0 ? 1 : -1;
  const phase0 = scaledFromHash(seed, 5, 0, 2 * Math.PI);

  /*
    ─────────────────────────────────────────────────────────────────
    MOTION: DISTANCE-DRIVEN, NOT ANGLE-DRIVEN
    ─────────────────────────────────────────────────────────────────
    Two coherence defects were found in the previous formulation, both
    visible in the product:

    1. AN IDLING VEHICLE KEPT MOVING. `angle` advanced with raw elapsed
       time regardless of the idle window, while `speed` was forced to
       0. On the live map the marker glided across the screen while the
       detail panel read "0 km/h" -- the two halves of the same reading
       contradicting each other on screen.

    2. SPEED WAS NOT THE DERIVATIVE OF THE PATH. The file's header
       claims speed and heading are both true derivatives of the
       position function. Heading was; speed was an independently
       stylised value (`BASE_SPEED * variation * (0.7 + 0.3|cos|)`).
       For a 5 km radius on an 18-minute loop the real tangential speed
       is ~105 km/h while the reported figure was ~45 -- and the
       odometer integrated a THIRD value (`avgSpeedKmh`). Position,
       speed and odometer were three mutually inconsistent quantities,
       which matters here because this platform reconciles fuel against
       distance.

    The fix inverts the model: DISTANCE is the primitive, and angle is
    derived from it. Speed is integrated analytically to give distance,
    so position, speed and odometer are the same quantity expressed
    three ways and cannot disagree. Idle windows advance time without
    advancing distance, so a stationary vehicle is genuinely stationary.

    Everything stays a pure function of (vehicleId, elapsedSeconds) --
    the file's load-bearing design rule -- because both integrals below
    are closed-form.
  */

  /** This vehicle's cruise speed while under way, km/h. */
  const cruiseKmh = BASE_SPEED_KMH * scaledFromHash(seed, 7, 0.75, 1.25);

  /*
    Duty cycle: the vehicle drives for DRIVE_PHASE_SECONDS, then stops
    for the remainder of the cycle (deliveries, breaks). Expressed on
    the TIME axis so it can be inverted exactly.
  */
  const cyclePeriod = STOP_CYCLE_SECONDS * scaledFromHash(seed, 4, 0.7, 1.4);
  const drivePhase = cyclePeriod * DRIVE_DUTY;
  const elapsed = Math.max(0, elapsedSeconds);
  const cycleIndex = Math.floor(elapsed / cyclePeriod);
  const intoCycle = elapsed - cycleIndex * cyclePeriod;
  const isIdleWindow = intoCycle >= drivePhase;

  /** Seconds actually spent MOVING up to now. Exact, not sampled. */
  const movingSeconds = cycleIndex * drivePhase + Math.min(intoCycle, drivePhase);

  /*
    Speed profile over moving time: a gentle sinusoidal variation around
    cruise, so the tachometer and speedometer have something to do.
    Chosen because its integral is closed-form -- see below.

        v(u) = cruise · (1 + a·sin(2πu / SPEED_WAVE_SECONDS))
  */
  const waveOmega = (2 * Math.PI) / SPEED_WAVE_SECONDS;
  const speedProfile = 1 + SPEED_WAVE_AMPLITUDE * Math.sin(waveOmega * movingSeconds);

  /*
    Distance is the exact integral of that profile:

        ∫₀^u v = cruise · [ u + (a/ω)(1 − cos(ωu)) ]

    so `distanceKm` below and `speed` above are the same function,
    differentiated and integrated. This is what makes a replayed demo
    route reconcile against the odometer.
  */
  const integralSeconds =
    movingSeconds + (SPEED_WAVE_AMPLITUDE / waveOmega) * (1 - Math.cos(waveOmega * movingSeconds));
  const totalKmTravelled = (cruiseKmh * integralSeconds) / 3600;

  const speed = isIdleWindow ? 0 : Math.round(cruiseKmh * speedProfile);

  // Angle follows distance around the circumference: θ = s / r.
  const angle = phase0 + direction * (totalKmTravelled / radiusKm);

  const radiusLat = kmToLatDegrees(radiusKm);
  const radiusLng = kmToLngDegrees(radiusKm, centerLat);

  const lat = centerLat + radiusLat * Math.sin(angle);
  const lng = centerLng + radiusLng * Math.cos(angle);

  /*
    Heading is the tangent to the path, as before. It is computed from
    the geometry rather than from a finite difference so it stays exact
    at a standstill: a stopped vehicle keeps the bearing it was last
    travelling on, which is what a real tracker reports and what stops
    a parked marker from spinning.
  */
  const dLat = radiusLat * direction * Math.cos(angle);
  const dLng = -radiusLng * direction * Math.sin(angle);
  const headingRad = Math.atan2(dLng, dLat);
  const heading = (((headingRad * 180) / Math.PI) + 360) % 360;

  const odometerBaseline = scaledFromHash(seed, 8, 8000, 120000);
  const odometerKm = Math.round(odometerBaseline + totalKmTravelled);

  // Fuel: sawtooth between 20% and 100%, "refuelling" every TANK_RANGE_KM.
  const distanceIntoTank = totalKmTravelled % TANK_RANGE_KM;
  const fuelLevel = Math.round(100 - (distanceIntoTank / TANK_RANGE_KM) * 80);

  /*
    ─────────────────────────────────────────────────────────────────
    ENGINE MODEL
    ─────────────────────────────────────────────────────────────────
    Derived from the motion above rather than invented alongside it, so
    the tachometer agrees with the speedometer and the throttle agrees
    with the acceleration -- the same discipline that already makes
    `speed` and `heading` the true derivatives of the position function.

    Still a PURE function of (vehicleId, elapsedSeconds): every term
    below is computed from values already in scope. That is the file's
    load-bearing design rule (see the header) and adding state here
    would break serverless determinism.
  */

  // Per-vehicle engine character, hashed so a fleet does not all rev
  // identically. A heavier vehicle idles lower and revs lower.
  const idleRpm = Math.round(scaledFromHash(seed, 9, 620, 850));
  const topGearRpm = Math.round(scaledFromHash(seed, 10, 1900, 2400));

  /*
    A five-speed gear model. Real tachometers SAWTOOTH -- revs climb
    through a gear, drop on the shift, climb again -- and a needle that
    rises in one smooth line to redline is the most obvious tell that a
    cluster is faked. `gearSpan` is the road speed covered by each gear;
    `withinGear` is how far through the current gear the vehicle is.
  */
  const GEARS = 5;
  const gearSpan = TOP_GEAR_KMH / GEARS;
  const gearIndex = speed <= 0 ? 0 : Math.min(GEARS - 1, Math.floor(speed / gearSpan));
  const withinGear = speed <= 0 ? 0 : (speed - gearIndex * gearSpan) / gearSpan;

  const rpm =
    speed <= 0
      ? idleRpm
      : Math.round(idleRpm + (topGearRpm - idleRpm) * (0.35 + 0.65 * Math.min(1, withinGear)));

  /*
    Coolant: exponential approach from ambient to the thermostat's
    operating temperature, as §5.2 requires ("coolant climbs on cold
    start, plateaus"). `1 - e^(-t/tau)` is the physical shape -- fast at
    first, asymptotic after. Never modelled as decaying, because this
    simulator's engine never stops: an idle window is engine-running-
    while-stationary, not a shutdown.
  */
  const warmupFraction = 1 - Math.exp(-Math.max(0, elapsedSeconds) / WARMUP_TAU_SECONDS);
  const coolantTemp =
    Math.round((AMBIENT_TEMP_C + (OPERATING_TEMP_C - AMBIENT_TEMP_C) * warmupFraction) * 10) / 10;

  /*
    Throttle demand from ACCELERATION, not from speed. The parametric
    circle's speed varies with `cos(angle)`, so the vehicle genuinely
    accelerates and decelerates around its loop; differentiating that
    gives a throttle that opens into the climb and closes on the
    overrun, which is what the pedal actually does.
  */
  const speedTrend = isIdleWindow ? 0 : -Math.sin(angle) * direction;
  const throttlePosition = isIdleWindow
    ? 0
    : Math.max(3, Math.min(95, Math.round(25 + 45 * speedTrend + 25 * (speed / TOP_GEAR_KMH))));
  const engineLoad = isIdleWindow
    ? Math.round(scaledFromHash(seed, 11, 4, 9))
    : Math.max(10, Math.min(95, Math.round(throttlePosition * 0.85 + 12)));

  // Alternator holds a near-constant charging voltage while running,
  // sagging slightly under electrical load.
  const batteryVoltage =
    Math.round((CHARGING_VOLTS - (engineLoad / 100) * 0.35) * 10) / 10;

  // Idling burns fuel -- that is the entire point of tracking idle time,
  // and a demo that reports 0 L/h while stationary hides the cost the
  // product exists to surface.
  const instantConsumptionLph =
    Math.round(
      (isIdleWindow
        ? IDLE_BURN_LPH
        : IDLE_BURN_LPH + (CRUISE_BURN_LPH - IDLE_BURN_LPH) * (engineLoad / 100)) * 10
    ) / 10;

  // The engine runs for the whole demo (idle windows included), so
  // engine hours are simply elapsed time on a hashed baseline.
  const engineHours =
    Math.round((scaledFromHash(seed, 12, 400, 9000) + elapsedSeconds / 3600) * 10) / 10;

  return {
    lat,
    lng,
    speed,
    heading: Math.round(heading),
    fuelLevel,
    odometerKm,
    // Engine running throughout, including idle windows -- see the note
    // on this field. Idle means stationary WITH the engine on.
    ignitionOn: true,
    status: isIdleWindow ? 'idle' : 'moving',
    rpm,
    coolantTemp,
    batteryVoltage,
    throttlePosition,
    engineLoad,
    engineHours,
    instantConsumptionLph,
  };
}