// modules/telematics/adapters/eagletrack/eagletrack-io.map.ts
//
// Eagle Track ("api2") reports every non-GPS signal as an `io` object
// keyed by a NUMERIC STRING code -- `io["1"]` is ignition, `io["226"]`
// is the CAN odometer, and so on. The vendor documents ~60 codes; the
// payload for any given tracker carries only the handful its firmware
// and wiring actually produce.
//
// This file exists so that no numeric IO code is ever written inline in
// eagletrack.adapter.ts. Everything here is plain data -- a catalogue of
// codes plus ordered preference lists -- so extending the integration to
// a new signal is a one-line addition here rather than a new branch in
// the mapper. That is deliberate: the alternative (a switch in the
// adapter) is where "magic number 226" ends up undocumented six months
// from now.
//
// SOURCE: the "Supported IO ID List" table in the Eagle Track API V2
// documentation. Codes are transcribed verbatim; names/units below are
// the vendor's own, not our interpretation.

/** Named constants for every IO code this integration reads or records. */
export const EAGLETRACK_IO = {
  IGNITION: '1',
  BLOCKED: '2',
  ENGINE_HOURS: '3',
  DOOR: '4',
  ODOMETER: '7',
  DRIVER: '8',
  SPEED: '10',
  TEMPERATURE_1: '160',
  BATTERY_VOLTS: '176',
  BATTERY_LEVEL_PERCENT: '177',
  CHARGE: '178',
  POWER_VOLTS: '179',
  FUEL_LEVEL_L_1: '192',
  FUEL_LEVEL_L_2: '193',
  FUEL_LEVEL_L_3: '194',
  FUEL_LEVEL_L_4: '195',
  FUEL_LEVEL_L_5: '196',
  FUEL_USED_L: '198',
  FUEL_CONSUMPTION_LPH: '199',
  FUEL_LEVEL_PERCENT: '200',
  RPM: '208',
  VIN: '209',
  CAN_FUEL_LEVEL_L: '224',
  CAN_TOTAL_FUEL_USED_L: '225',
  CAN_ODOMETER: '226',
  CAN_RPM: '227',
  CAN_FUEL_LEVEL_PERCENT: '228',
  CAN_SPEED: '229',
  CAN_ENGINE_WORK_TIME_MIN: '230',
  CAN_ENGINE_TEMPERATURE: '231',
} as const;

export type EagleTrackIoCode = (typeof EAGLETRACK_IO)[keyof typeof EAGLETRACK_IO];

/**
 * Human-readable catalogue, used only to label values we pass through to
 * the reading's provider metadata bag. Not every documented code is
 * listed -- only the ones this adapter reads or records -- because an
 * unlabelled code is recorded under its raw number anyway (see
 * `describeIoCode`), which is more honest than inventing a name.
 */
export const EAGLETRACK_IO_CATALOGUE: Readonly<Record<string, { name: string; unit?: string }>> = {
  [EAGLETRACK_IO.IGNITION]: { name: 'Ignition' },
  [EAGLETRACK_IO.BLOCKED]: { name: 'Blocked' },
  [EAGLETRACK_IO.ENGINE_HOURS]: { name: 'Engine Hours', unit: 'h' },
  [EAGLETRACK_IO.DOOR]: { name: 'Door' },
  [EAGLETRACK_IO.ODOMETER]: { name: 'Odometer', unit: 'km' },
  [EAGLETRACK_IO.SPEED]: { name: 'Speed', unit: 'km/h' },
  [EAGLETRACK_IO.BATTERY_VOLTS]: { name: 'Battery', unit: 'V' },
  [EAGLETRACK_IO.BATTERY_LEVEL_PERCENT]: { name: 'Battery Level', unit: '%' },
  [EAGLETRACK_IO.CHARGE]: { name: 'Charge' },
  [EAGLETRACK_IO.POWER_VOLTS]: { name: 'Power', unit: 'V' },
  [EAGLETRACK_IO.FUEL_LEVEL_L_1]: { name: 'Fuel Level 1', unit: 'L' },
  [EAGLETRACK_IO.FUEL_LEVEL_L_2]: { name: 'Fuel Level 2', unit: 'L' },
  [EAGLETRACK_IO.FUEL_LEVEL_L_3]: { name: 'Fuel Level 3', unit: 'L' },
  [EAGLETRACK_IO.FUEL_LEVEL_L_4]: { name: 'Fuel Level 4', unit: 'L' },
  [EAGLETRACK_IO.FUEL_LEVEL_L_5]: { name: 'Fuel Level 5', unit: 'L' },
  [EAGLETRACK_IO.FUEL_USED_L]: { name: 'Fuel Used', unit: 'L' },
  [EAGLETRACK_IO.FUEL_CONSUMPTION_LPH]: { name: 'Fuel Consumption', unit: 'L/h' },
  [EAGLETRACK_IO.FUEL_LEVEL_PERCENT]: { name: 'Fuel Level Percent', unit: '%' },
  [EAGLETRACK_IO.RPM]: { name: 'RPM' },
  [EAGLETRACK_IO.CAN_FUEL_LEVEL_L]: { name: 'CAN Fuel Level', unit: 'L' },
  [EAGLETRACK_IO.CAN_TOTAL_FUEL_USED_L]: { name: 'CAN Total Fuel Used', unit: 'L' },
  [EAGLETRACK_IO.CAN_ODOMETER]: { name: 'CAN Odometer', unit: 'km' },
  [EAGLETRACK_IO.CAN_RPM]: { name: 'CAN RPM' },
  [EAGLETRACK_IO.CAN_FUEL_LEVEL_PERCENT]: { name: 'CAN Fuel Level Percent', unit: '%' },
  [EAGLETRACK_IO.CAN_SPEED]: { name: 'CAN Speed', unit: 'km/h' },
  [EAGLETRACK_IO.CAN_ENGINE_WORK_TIME_MIN]: { name: 'CAN Engine Work Time', unit: 'min' },
  [EAGLETRACK_IO.CAN_ENGINE_TEMPERATURE]: { name: 'CAN Engine Temperature', unit: '\u00b0C' },
};

/**
 * ORDERED preference lists. The first code present in a payload wins.
 *
 * CAN-bus signals are preferred over device-derived ones because the CAN
 * value is the vehicle's own instrument reading, whereas the device
 * value is accumulated by the tracker itself -- the vendor's own sample
 * payload shows `io["7"] = 3.149` (km), i.e. distance since the unit was
 * installed, which would be flatly wrong as a fleet odometer.
 *
 * KNOWN HAZARD (documented in eagletrack.adapter.ts's header and the
 * changelog): if a tracker reports the CAN code intermittently, the
 * odometer will jump between the two scales between readings. The
 * adapter therefore records WHICH code it used on every reading
 * (`providerMetadata.odometerSourceCode`) so such a jump is diagnosable
 * rather than mysterious. Flipping the preference is a one-line change
 * to the array below -- no adapter change.
 */
export const ODOMETER_KM_CODES: readonly string[] = [EAGLETRACK_IO.CAN_ODOMETER, EAGLETRACK_IO.ODOMETER];

/** Fuel level as a PERCENT. Only these feed TelematicsData.engine.fuelLevel -- see FUEL_LEVEL_LITRE_CODES. */
export const FUEL_PERCENT_CODES: readonly string[] = [
  EAGLETRACK_IO.CAN_FUEL_LEVEL_PERCENT,
  EAGLETRACK_IO.FUEL_LEVEL_PERCENT,
];

/**
 * Fuel level in LITRES. Deliberately NOT mapped onto
 * TelematicsData.engine.fuelLevel: that field is a percentage
 * (shared/validations/telematics.schema.ts constrains it to 0-100 and
 * telematics.service.ts raises a high-severity "Low fuel level: N%"
 * alert below 10). Writing "8 litres" into a percent field would
 * manufacture a fuel alert on a full tank. Litres are recorded in the
 * reading's provider metadata instead, where a future tank-capacity
 * feature can convert them properly.
 */
export const FUEL_LEVEL_LITRE_CODES: readonly string[] = [
  EAGLETRACK_IO.CAN_FUEL_LEVEL_L,
  EAGLETRACK_IO.FUEL_LEVEL_L_1,
  EAGLETRACK_IO.FUEL_LEVEL_L_2,
  EAGLETRACK_IO.FUEL_LEVEL_L_3,
  EAGLETRACK_IO.FUEL_LEVEL_L_4,
  EAGLETRACK_IO.FUEL_LEVEL_L_5,
];

export const RPM_CODES: readonly string[] = [EAGLETRACK_IO.CAN_RPM, EAGLETRACK_IO.RPM];
export const ENGINE_TEMPERATURE_CODES: readonly string[] = [EAGLETRACK_IO.CAN_ENGINE_TEMPERATURE];
export const FUEL_CONSUMPTION_LPH_CODES: readonly string[] = [EAGLETRACK_IO.FUEL_CONSUMPTION_LPH];
export const FUEL_USED_L_CODES: readonly string[] = [
  EAGLETRACK_IO.CAN_TOTAL_FUEL_USED_L,
  EAGLETRACK_IO.FUEL_USED_L,
];

/**
 * Codes recorded verbatim in the reading's provider metadata because
 * TelematicsData has no field for them and forcing them into an
 * unrelated numeric field would corrupt that field's meaning (the
 * §2 instruction: "put in a metadata bag, don't force it into an
 * unrelated field").
 */
export const METADATA_ONLY_CODES: readonly string[] = [
  EAGLETRACK_IO.BATTERY_VOLTS,
  EAGLETRACK_IO.BATTERY_LEVEL_PERCENT,
  EAGLETRACK_IO.POWER_VOLTS,
  EAGLETRACK_IO.CHARGE,
  EAGLETRACK_IO.ENGINE_HOURS,
  EAGLETRACK_IO.CAN_ENGINE_WORK_TIME_MIN,
  EAGLETRACK_IO.DOOR,
  EAGLETRACK_IO.BLOCKED,
];

export type EagleTrackIoBag = Record<string, unknown> | undefined | null;

/** A numeric IO reading together with the code it came from, so the source stays traceable. */
export interface IoPick {
  code: string;
  value: number;
}

/**
 * Returns the first code in `codes` that carries a finite numeric value.
 * Vendor payloads send numbers unquoted in the documented samples, but
 * white-labelled deployments have been observed to stringify numerics,
 * so a numeric string is accepted too. Booleans are rejected: `true`
 * coerces to 1 and would silently become an odometer of 1 km.
 */
export function pickNumericIo(io: EagleTrackIoBag, codes: readonly string[]): IoPick | null {
  if (!io || typeof io !== 'object') return null;

  for (const code of codes) {
    const raw = (io as Record<string, unknown>)[code];
    if (raw === undefined || raw === null || raw === '') continue;
    if (typeof raw === 'boolean') continue;

    const value = typeof raw === 'number' ? raw : Number(raw);
    if (Number.isFinite(value)) return { code, value };
  }

  return null;
}

/**
 * Reads a boolean-ish IO flag. The vendor encodes booleans as 0/1
 * integers (`"1": 1` means ignition on), so `Boolean(0)` is the correct
 * reading, but real strings ("0"/"false") are handled too rather than
 * trusting every deployment to be consistent. Returns null when the code
 * is absent -- "not reported" and "reported as off" are different facts
 * and the adapter treats them differently.
 */
export function pickBooleanIo(io: EagleTrackIoBag, code: string): boolean | null {
  if (!io || typeof io !== 'object') return null;

  const raw = (io as Record<string, unknown>)[code];
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'number') return raw !== 0;
  if (typeof raw === 'string') {
    const normalized = raw.trim().toLowerCase();
    if (normalized === 'false' || normalized === '0') return false;
    if (normalized === 'true' || normalized === '1') return true;
    const numeric = Number(normalized);
    return Number.isFinite(numeric) ? numeric !== 0 : null;
  }

  return null;
}

/** Label for a code, falling back to the raw code rather than inventing a name. */
export function describeIoCode(code: string): string {
  return EAGLETRACK_IO_CATALOGUE[code]?.name ?? `io_${code}`;
}

/** Collects the METADATA_ONLY_CODES present on a reading, keyed by their documented names. */
export function collectMetadataOnlyIo(io: EagleTrackIoBag): Record<string, number | boolean> {
  const out: Record<string, number | boolean> = {};
  if (!io || typeof io !== 'object') return out;

  for (const code of METADATA_ONLY_CODES) {
    const raw = (io as Record<string, unknown>)[code];
    if (raw === undefined || raw === null || raw === '') continue;

    if (typeof raw === 'boolean') {
      out[describeIoCode(code)] = raw;
      continue;
    }

    const numeric = typeof raw === 'number' ? raw : Number(raw);
    if (Number.isFinite(numeric)) out[describeIoCode(code)] = numeric;
  }

  return out;
}

/** Parsed form of the `signalex` triplet. Informational only -- never mapped onto a TelematicsData field. */
export interface EagleTrackSignalQuality {
  /** Device battery capacity, 0-100. Vendor encodes 0-F as 0%-100%. */
  batteryPercent: number;
  /** GSM signal quality, 0-31 (the standard RSSI scale). Vendor encodes 0-F across that range. */
  gsmQuality: number;
  /** Satellites used for the fix, 0-15. Vendor encodes 0-F directly. */
  gpsSatellites: number;
}

/**
 * `signalex` is a three-character hex triplet "[gsb]":
 *   g = battery capacity, 0-F mapped onto 0%-100%
 *   s = GSM quality,      0-F mapped onto 0-31
 *   b = GPS satellites,   0-F mapped onto 0-15 (i.e. the nibble itself)
 *
 * Returns null for anything that isn't exactly three hex digits rather
 * than partially decoding a malformed value -- a half-parsed signal
 * reading is worse than an absent one.
 */
export function parseSignalEx(signalex: unknown): EagleTrackSignalQuality | null {
  if (typeof signalex !== 'string') return null;

  const trimmed = signalex.trim();
  if (!/^[0-9a-fA-F]{3}$/.test(trimmed)) return null;

  const battery = parseInt(trimmed[0], 16);
  const gsm = parseInt(trimmed[1], 16);
  const satellites = parseInt(trimmed[2], 16);

  return {
    batteryPercent: Math.round((battery / 15) * 100),
    gsmQuality: Math.round((gsm / 15) * 31),
    gpsSatellites: satellites,
  };
}
