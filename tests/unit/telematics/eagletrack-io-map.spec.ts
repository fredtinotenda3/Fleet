// tests/unit/telematics/eagletrack-io-map.spec.ts
//
// The IO map is where an Eagle Track payload becomes a number in our
// database, so these are the assertions that stop a silent unit error.
// Two properties matter more than the rest and are called out below:
//
//   * a litre reading must never be mistaken for a percentage
//     (telematics.service.ts raises a high-severity alert below 10, so
//     "8 litres" read as "8%" fabricates a fuel alert on a full tank);
//   * a boolean IO flag must never be coerced into a numeric field
//     (`true` becomes 1, which would show up as a 1 km odometer).

import {
  collectMetadataOnlyIo,
  EAGLETRACK_IO,
  FUEL_LEVEL_LITRE_CODES,
  FUEL_PERCENT_CODES,
  ODOMETER_KM_CODES,
  parseSignalEx,
  pickBooleanIo,
  pickNumericIo,
} from '../../../modules/telematics/adapters/eagletrack/eagletrack-io.map';

describe('pickNumericIo', () => {
  it('returns the first code present, in preference order, with the code it came from', () => {
    const io = { [EAGLETRACK_IO.ODOMETER]: 3.149, [EAGLETRACK_IO.CAN_ODOMETER]: 152_340 };
    expect(pickNumericIo(io, ODOMETER_KM_CODES)).toEqual({
      code: EAGLETRACK_IO.CAN_ODOMETER,
      value: 152_340,
    });
  });

  it('falls back down the preference list when the preferred code is absent', () => {
    const io = { [EAGLETRACK_IO.ODOMETER]: 3.149 };
    expect(pickNumericIo(io, ODOMETER_KM_CODES)).toEqual({ code: EAGLETRACK_IO.ODOMETER, value: 3.149 });
  });

  it('returns null when no code in the list is present', () => {
    expect(pickNumericIo({ '35': 1 }, ODOMETER_KM_CODES)).toBeNull();
    expect(pickNumericIo({}, ODOMETER_KM_CODES)).toBeNull();
    expect(pickNumericIo(undefined, ODOMETER_KM_CODES)).toBeNull();
    expect(pickNumericIo(null, ODOMETER_KM_CODES)).toBeNull();
  });

  it('accepts a stringified numeric, since white-labelled deployments have been seen to quote numbers', () => {
    expect(pickNumericIo({ [EAGLETRACK_IO.CAN_ODOMETER]: '152340' }, ODOMETER_KM_CODES)).toEqual({
      code: EAGLETRACK_IO.CAN_ODOMETER,
      value: 152_340,
    });
  });

  it('rejects a boolean rather than coercing it -- `true` would silently become an odometer of 1 km', () => {
    expect(pickNumericIo({ [EAGLETRACK_IO.CAN_ODOMETER]: true }, ODOMETER_KM_CODES)).toBeNull();
  });

  it('skips non-numeric and empty values rather than producing NaN', () => {
    expect(pickNumericIo({ [EAGLETRACK_IO.CAN_ODOMETER]: 'n/a' }, ODOMETER_KM_CODES)).toBeNull();
    expect(pickNumericIo({ [EAGLETRACK_IO.CAN_ODOMETER]: '' }, ODOMETER_KM_CODES)).toBeNull();
    expect(pickNumericIo({ [EAGLETRACK_IO.CAN_ODOMETER]: null }, ODOMETER_KM_CODES)).toBeNull();
  });

  it('keeps a genuine zero -- 0 km is a real reading, not a missing one', () => {
    expect(pickNumericIo({ [EAGLETRACK_IO.CAN_ODOMETER]: 0 }, ODOMETER_KM_CODES)).toEqual({
      code: EAGLETRACK_IO.CAN_ODOMETER,
      value: 0,
    });
  });
});

describe('fuel percent and fuel litre codes are disjoint', () => {
  // The load-bearing invariant. engine.fuelLevel is a percentage; a
  // litre code leaking into FUEL_PERCENT_CODES would raise a
  // "Low fuel level: 8%" alert for a vehicle with 8 litres in a 60-litre
  // tank, on every poll.
  it('shares no code between the percentage list and the litre list', () => {
    const overlap = FUEL_PERCENT_CODES.filter((code) => FUEL_LEVEL_LITRE_CODES.includes(code));
    expect(overlap).toEqual([]);
  });

  it('does not resolve a percentage from a litres-only payload', () => {
    const litresOnly = { [EAGLETRACK_IO.FUEL_LEVEL_L_1]: 42 };
    expect(pickNumericIo(litresOnly, FUEL_PERCENT_CODES)).toBeNull();
    expect(pickNumericIo(litresOnly, FUEL_LEVEL_LITRE_CODES)).toEqual({
      code: EAGLETRACK_IO.FUEL_LEVEL_L_1,
      value: 42,
    });
  });

  it('prefers the CAN percentage over the device percentage', () => {
    const io = { [EAGLETRACK_IO.FUEL_LEVEL_PERCENT]: 40, [EAGLETRACK_IO.CAN_FUEL_LEVEL_PERCENT]: 55 };
    expect(pickNumericIo(io, FUEL_PERCENT_CODES)?.value).toBe(55);
  });
});

describe('pickBooleanIo', () => {
  it('reads the vendor 0/1 integer encoding', () => {
    expect(pickBooleanIo({ [EAGLETRACK_IO.IGNITION]: 1 }, EAGLETRACK_IO.IGNITION)).toBe(true);
    expect(pickBooleanIo({ [EAGLETRACK_IO.IGNITION]: 0 }, EAGLETRACK_IO.IGNITION)).toBe(false);
  });

  it('distinguishes "reported off" from "not reported" -- they drive different behaviour', () => {
    expect(pickBooleanIo({ [EAGLETRACK_IO.IGNITION]: 0 }, EAGLETRACK_IO.IGNITION)).toBe(false);
    expect(pickBooleanIo({}, EAGLETRACK_IO.IGNITION)).toBeNull();
    expect(pickBooleanIo(undefined, EAGLETRACK_IO.IGNITION)).toBeNull();
  });

  it('handles string encodings without trusting every deployment to be consistent', () => {
    expect(pickBooleanIo({ '1': '1' }, EAGLETRACK_IO.IGNITION)).toBe(true);
    expect(pickBooleanIo({ '1': 'false' }, EAGLETRACK_IO.IGNITION)).toBe(false);
    expect(pickBooleanIo({ '1': 'TRUE' }, EAGLETRACK_IO.IGNITION)).toBe(true);
  });
});

describe('parseSignalEx', () => {
  it('decodes the vendor sample "f98" per the documented scales', () => {
    // g=f -> 15/15 = 100%; s=9 -> round(9/15*31) = 19; b=8 -> 8 satellites.
    expect(parseSignalEx('f98')).toEqual({ batteryPercent: 100, gsmQuality: 19, gpsSatellites: 8 });
  });

  it('decodes an all-zero triplet as genuinely zero rather than absent', () => {
    expect(parseSignalEx('000')).toEqual({ batteryPercent: 0, gsmQuality: 0, gpsSatellites: 0 });
  });

  it('returns null for anything malformed rather than half-decoding it', () => {
    expect(parseSignalEx('f9')).toBeNull();
    expect(parseSignalEx('f98a')).toBeNull();
    expect(parseSignalEx('xyz')).toBeNull();
    expect(parseSignalEx(undefined)).toBeNull();
    expect(parseSignalEx(123)).toBeNull();
  });
});

describe('collectMetadataOnlyIo', () => {
  it('labels battery/power signals by their documented names', () => {
    const collected = collectMetadataOnlyIo({
      [EAGLETRACK_IO.BATTERY_VOLTS]: 4.1,
      [EAGLETRACK_IO.POWER_VOLTS]: 12.6,
      [EAGLETRACK_IO.ENGINE_HOURS]: 1204,
    });

    expect(collected).toEqual({ Battery: 4.1, Power: 12.6, 'Engine Hours': 1204 });
  });

  it('ignores codes that map to a real TelematicsData field, so nothing is recorded twice', () => {
    const collected = collectMetadataOnlyIo({
      [EAGLETRACK_IO.CAN_ODOMETER]: 152_340,
      [EAGLETRACK_IO.FUEL_LEVEL_PERCENT]: 60,
    });

    expect(collected).toEqual({});
  });

  it('returns an empty object for an absent io bag rather than throwing', () => {
    expect(collectMetadataOnlyIo(undefined)).toEqual({});
    expect(collectMetadataOnlyIo(null)).toEqual({});
  });
});
