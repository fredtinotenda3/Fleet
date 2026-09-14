// frontend/modules/vehicles/utils/vehicle-profile.ts
//
// ---------------------------------------------------------------------
// GAUGE RANGES PER VEHICLE CLASS
// ---------------------------------------------------------------------
// An instrument cluster is only credible if it is scaled to the vehicle
// it belongs to. A heavy truck's tachometer redlines around 2,500 rpm;
// a motorcycle's runs past 10,000. A speedometer that reads to 220 km/h
// on a 40-tonne rigid is the single most obvious tell that a cluster is
// decorative rather than instrumented.
//
// Nothing in the platform carried this information: `Vehicle` has no
// specs, no engine data, no tank capacity, no top speed
// (shared/types/vehicle.types.ts). So the profile is RESOLVED from
// `vehicle_type` + `fuel_type`, both of which are free text.
//
// ---------------------------------------------------------------------
// WHY IT MIRRORS vehicle-glyph.ts RATHER THAN INVENTING A SCHEME
// ---------------------------------------------------------------------
// `frontend/modules/telematics/utils/vehicle-glyph.ts` already solves
// exactly this problem for map icons: free text in, a small closed set
// out, priority-ordered substring matching, never throws, documented
// fallback. That resolver exists because this deployment's real data
// contains values like `"      DAF                  "` and `"Truck"`
// with inconsistent casing.
//
// Re-deriving a second normalisation scheme here would give the platform
// two answers to "what kind of vehicle is this", which is the class of
// duplication that produced the allocation-posting and fuel-driver
// defects. So this file matches that file's structure deliberately, and
// the two are asserted to agree on the classes they share.
//
// ---------------------------------------------------------------------
// A PROFILE IS A DISPLAY RANGE, NOT A MEASUREMENT
// ---------------------------------------------------------------------
// Nothing here is presented to the user as a fact about their vehicle.
// A profile decides where a needle sits on a dial; it never supplies a
// VALUE. If the tachometer has no RPM signal it reads UNAVAILABLE
// regardless of what redline this file would have drawn. That
// distinction is what keeps this from being fabricated hardware data.

/** The classes the cluster can scale to. */
export type VehicleClass =
  | 'motorcycle'
  | 'light-vehicle'
  | 'van'
  | 'light-truck'
  | 'heavy-truck'
  | 'bus'
  | 'plant'
  | 'trailer';

export interface GaugeRange {
  min: number;
  max: number;
  /** Value at which the gauge enters its warning band. Omitted when the class has none. */
  warnAbove?: number;
  warnBelow?: number;
  /** Value at which the band becomes critical. */
  dangerAbove?: number;
  dangerBelow?: number;
}

export interface VehicleProfile {
  vehicleClass: VehicleClass;
  /** Human label for the class, for a tooltip explaining why the dial is scaled as it is. */
  label: string;
  speed: GaugeRange;
  /** Absent for an electric drivetrain -- see `isElectric`. */
  rpm?: GaugeRange;
  coolant: GaugeRange;
  /** Percent. */
  fuel: GaugeRange;
  /** Volts. */
  battery: GaugeRange;
  /**
   * True when the drivetrain has no engine speed to display.
   *
   * NOT the same as "RPM unavailable". An RPM gauge on a diesel with a
   * silent sensor reads UNAVAILABLE — the signal is missing and might
   * arrive. An RPM gauge on an EV is NOT APPLICABLE — the quantity does
   * not exist, and showing a dead dial implies a fault. §5.5 requires
   * the state-of-charge and power-flow readouts in its place.
   */
  isElectric: boolean;
}

/** Everything a coolant gauge does is the same across combustion classes. */
const COOLANT: GaugeRange = { min: 40, max: 130, warnAbove: 105, dangerAbove: 115 };
/** Fuel is a percentage everywhere; the warning bands are what matter. */
const FUEL: GaugeRange = { min: 0, max: 100, warnBelow: 20, dangerBelow: 10 };
/** A 12 V system running. Below 12 the alternator is not charging; above 15 it is overcharging. */
const BATTERY_12V: GaugeRange = { min: 10, max: 16, warnBelow: 12.2, dangerBelow: 11.8, dangerAbove: 15 };
/** Heavy vehicles run 24 V. Reading one on a 12 V dial pins the needle permanently. */
const BATTERY_24V: GaugeRange = { min: 20, max: 32, warnBelow: 24.2, dangerBelow: 23.6, dangerAbove: 30 };

const PROFILES: Record<VehicleClass, Omit<VehicleProfile, 'isElectric'>> = {
  motorcycle: {
    vehicleClass: 'motorcycle',
    label: 'Motorcycle',
    speed: { min: 0, max: 180, warnAbove: 120 },
    rpm: { min: 0, max: 12000, warnAbove: 9500, dangerAbove: 11000 },
    coolant: COOLANT,
    fuel: FUEL,
    battery: BATTERY_12V,
  },
  'light-vehicle': {
    vehicleClass: 'light-vehicle',
    label: 'Light vehicle',
    speed: { min: 0, max: 200, warnAbove: 120 },
    rpm: { min: 0, max: 7000, warnAbove: 5500, dangerAbove: 6200 },
    coolant: COOLANT,
    fuel: FUEL,
    battery: BATTERY_12V,
  },
  van: {
    vehicleClass: 'van',
    label: 'Van',
    speed: { min: 0, max: 160, warnAbove: 110 },
    rpm: { min: 0, max: 5500, warnAbove: 4200, dangerAbove: 4800 },
    coolant: COOLANT,
    fuel: FUEL,
    battery: BATTERY_12V,
  },
  'light-truck': {
    vehicleClass: 'light-truck',
    label: 'Light truck',
    speed: { min: 0, max: 140, warnAbove: 100 },
    rpm: { min: 0, max: 4500, warnAbove: 3200, dangerAbove: 3800 },
    coolant: COOLANT,
    fuel: FUEL,
    battery: BATTERY_24V,
  },
  'heavy-truck': {
    vehicleClass: 'heavy-truck',
    label: 'Heavy truck',
    // Zimbabwe's heavy-vehicle limit is 80 km/h; the dial is scaled so
    // that limit sits well inside it rather than at the stop.
    speed: { min: 0, max: 120, warnAbove: 85 },
    rpm: { min: 0, max: 3000, warnAbove: 2200, dangerAbove: 2600 },
    coolant: COOLANT,
    fuel: FUEL,
    battery: BATTERY_24V,
  },
  bus: {
    vehicleClass: 'bus',
    label: 'Bus',
    speed: { min: 0, max: 140, warnAbove: 100 },
    rpm: { min: 0, max: 3500, warnAbove: 2500, dangerAbove: 3000 },
    coolant: COOLANT,
    fuel: FUEL,
    battery: BATTERY_24V,
  },
  plant: {
    vehicleClass: 'plant',
    label: 'Plant & equipment',
    // Plant is rarely road-going; a 200 km/h dial on a forklift is absurd.
    speed: { min: 0, max: 60, warnAbove: 40 },
    rpm: { min: 0, max: 3000, warnAbove: 2400, dangerAbove: 2800 },
    coolant: COOLANT,
    fuel: FUEL,
    battery: BATTERY_24V,
  },
  trailer: {
    vehicleClass: 'trailer',
    label: 'Trailer',
    // A trailer has no engine of its own. It keeps a speed dial because
    // a tracked trailer still reports GPS speed while under tow; `rpm`
    // is omitted below for the same reason it is omitted for an EV --
    // the quantity does not exist.
    speed: { min: 0, max: 120, warnAbove: 85 },
    coolant: COOLANT,
    fuel: FUEL,
    battery: BATTERY_24V,
  },
};

/**
 * Substring patterns per class, in priority order.
 *
 * ORDER MATTERS, and the ordering decisions are inherited from
 * `vehicle-glyph.ts` where they overlap: 'trailer' before 'truck'
 * because "truck trailer" appears in real data and the trailer is the
 * more specific classification; 'pickup' before 'truck' because a
 * pickup is a light vehicle to a fleet manager whatever the
 * registration says.
 */
const CLASS_PATTERNS: Array<{ vehicleClass: VehicleClass; patterns: string[] }> = [
  {
    vehicleClass: 'plant',
    patterns: ['forklift', 'fork lift', 'telehandler', 'loader', 'generator', 'genset', 'gen set',
      'compressor', 'tractor', 'harvester', 'excavator', 'backhoe', 'grader', 'dozer'],
  },
  { vehicleClass: 'trailer', patterns: ['trailer', 'semi', 'tanker', 'flatbed'] },
  { vehicleClass: 'bus', patterns: ['bus', 'coach', 'minibus', 'kombi'] },
  { vehicleClass: 'motorcycle', patterns: ['motorcycle', 'motorbike', 'bike', 'scooter'] },
  { vehicleClass: 'van', patterns: ['van', 'panel'] },
  {
    vehicleClass: 'light-vehicle',
    patterns: ['pickup', 'pick up', 'bakkie', 'car', 'sedan', 'hatch', 'suv', 'light'],
  },
  { vehicleClass: 'heavy-truck', patterns: ['heavy', 'rigid', 'haul', 'lorry', 'horse', 'tipper'] },
  { vehicleClass: 'light-truck', patterns: ['truck'] },
];

/**
 * The fallback, and the reasoning behind it.
 *
 * `vehicle-glyph.ts` defaults to 'truck' because a map must draw
 * something. This defaults to 'light-truck' rather than 'heavy-truck'
 * for a different reason: an unrecognised vehicle on a light-truck dial
 * shows a plausible needle for almost anything on a fleet's books,
 * whereas a heavy-truck dial pins the needle for any ordinary car.
 * Under-scaling is visible and self-correcting; over-scaling reads as a
 * broken instrument.
 */
export const DEFAULT_VEHICLE_CLASS: VehicleClass = 'light-truck';

function normalise(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Free-text vehicle type -> class. Never throws. */
export function vehicleClassFor(vehicleType?: string | null): VehicleClass {
  if (!vehicleType) return DEFAULT_VEHICLE_CLASS;
  const text = normalise(vehicleType);
  if (!text) return DEFAULT_VEHICLE_CLASS;

  for (const { vehicleClass, patterns } of CLASS_PATTERNS) {
    if (patterns.some((pattern) => text.includes(pattern))) return vehicleClass;
  }
  return DEFAULT_VEHICLE_CLASS;
}

/**
 * True when the drivetrain has no engine speed.
 *
 * Read from `fuel_type`, not `vehicle_type`: the platform expresses
 * "electric" there (see the dropdown in shared/config/constants.ts).
 * Hybrids are NOT treated as electric — they have a combustion engine
 * with a real tachometer.
 */
export function isElectricDrivetrain(fuelType?: string | null): boolean {
  if (!fuelType) return false;
  const text = normalise(fuelType);
  return text.includes('electric') || text === 'ev' || text.startsWith('ev ');
}

/**
 * Resolves the full display profile for a vehicle.
 *
 * Takes the two free-text fields rather than a `Vehicle`, so it can be
 * unit-tested and so a caller holding only a summary can use it.
 */
export function vehicleProfileFor(
  vehicleType?: string | null,
  fuelType?: string | null
): VehicleProfile {
  const vehicleClass = vehicleClassFor(vehicleType);
  const base = PROFILES[vehicleClass];
  const isElectric = isElectricDrivetrain(fuelType);

  if (isElectric) {
    // The tachometer is not merely blank — it is removed. See the note
    // on `isElectric`.
    const { rpm: _omitted, ...withoutRpm } = base;
    void _omitted;
    return { ...withoutRpm, isElectric: true };
  }

  return { ...base, isElectric: false };
}

/**
 * Where a value sits within a range's bands.
 *
 * `null` in -> `'unknown'`, never `'normal'`. An absent reading is not
 * a healthy one, and this is the function every gauge colours itself
 * from, so the distinction has to hold here or it holds nowhere.
 */
export type BandState = 'unknown' | 'normal' | 'warning' | 'danger';

export function bandFor(value: number | null | undefined, range: GaugeRange): BandState {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'unknown';

  if (range.dangerAbove !== undefined && value >= range.dangerAbove) return 'danger';
  if (range.dangerBelow !== undefined && value <= range.dangerBelow) return 'danger';
  if (range.warnAbove !== undefined && value >= range.warnAbove) return 'warning';
  if (range.warnBelow !== undefined && value <= range.warnBelow) return 'warning';
  return 'normal';
}
