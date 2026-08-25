// tests/unit/telematics/canonical-normalization.spec.ts
//
// PHASE 2 -- normalisation rules every adapter shares.
//
// These helpers exist so that adapters written later make the SAME
// decisions rather than each re-deriving them. The rules encode
// incidents this codebase has actually had:
//
//   * `Number('7.14 km')` is NaN -- which is how "every distance read as
//     not reported" was introduced once already.
//   * A provider timestamp with no zone designator parsed as LOCAL time
//     silently shifts every fix by the deployment's offset.
//   * A missing timestamp becoming `new Date(0)` or `new Date()` puts a
//     reading at one end or the other of every `timestamp` index.
//   * A substituted `0` for heading points every non-reporting vehicle
//     due north; for fuel level it manufactures a low-fuel alert.

import {
  normaliseTimestamp,
  normaliseNumber,
  normaliseBounded,
  normaliseHeading,
  normaliseIgnition,
  milesToKm,
  compact,
} from '@/modules/telematics/providers/canonical-telemetry';

describe('Phase 2: timestamp normalisation', () => {
  it('parses ISO-8601 with an explicit zone', () => {
    expect(normaliseTimestamp('2026-08-20T09:15:00.000Z')?.toISOString()).toBe(
      '2026-08-20T09:15:00.000Z'
    );
  });

  it('treats a zone-less "YYYY-MM-DD HH:mm:ss" as UTC, not server-local', () => {
    // A provider's server timezone is not ours. Reading it as local time
    // shifts every fix by the deployment's offset -- invisible in a UTC
    // container, wrong everywhere else.
    expect(normaliseTimestamp('2026-08-20 09:15:00')?.toISOString()).toBe(
      '2026-08-20T09:15:00.000Z'
    );
  });

  it('accepts an epoch in seconds and in milliseconds', () => {
    const ms = normaliseTimestamp(1_755_680_100_000);
    const secs = normaliseTimestamp(1_755_680_100);
    expect(ms?.toISOString()).toBe(secs?.toISOString());
  });

  it('returns undefined for an unparseable value rather than the Unix epoch', () => {
    // new Date('') is Invalid Date and new Date(0) is 1970 -- either
    // would sort as the oldest reading in the fleet and flow straight
    // into a `timestamp: -1` index.
    for (const bad of ['', '   ', 'not a date', null, undefined, {}, NaN]) {
      expect(normaliseTimestamp(bad)).toBeUndefined();
    }
  });

  it('rejects an Invalid Date instance', () => {
    expect(normaliseTimestamp(new Date('nonsense'))).toBeUndefined();
  });

  it('passes a valid Date through unchanged', () => {
    const d = new Date('2026-01-02T03:04:05.000Z');
    expect(normaliseTimestamp(d)).toBe(d);
  });
});

describe('Phase 2: numeric normalisation', () => {
  it('rejects NaN and Infinity', () => {
    expect(normaliseNumber(NaN)).toBeUndefined();
    expect(normaliseNumber(Infinity)).toBeUndefined();
    expect(normaliseNumber(-Infinity)).toBeUndefined();
  });

  it('rejects a unit-suffixed string rather than yielding NaN', () => {
    // The concrete incident: "7.14 km" -> Number(...) -> NaN. An adapter
    // whose provider sends display strings must strip the unit itself,
    // where the unit is known and can be VALIDATED.
    expect(normaliseNumber('7.14 km')).toBeUndefined();
  });

  it('preserves a genuine zero', () => {
    // A stationary vehicle really is doing 0 km/h.
    expect(normaliseNumber(0)).toBe(0);
    expect(normaliseNumber('0')).toBe(0);
  });

  it('returns undefined for empty and non-numeric input', () => {
    for (const bad of ['', '  ', null, undefined, {}, []]) {
      expect(normaliseNumber(bad)).toBeUndefined();
    }
  });

  it('bounds-checks rather than clamping', () => {
    // Clamping a latitude of 200 to 90 would place a vehicle at the
    // north pole and look like a real fix. Refusing says "unreadable".
    expect(normaliseBounded(45, -90, 90)).toBe(45);
    expect(normaliseBounded(200, -90, 90)).toBeUndefined();
    expect(normaliseBounded(-200, -180, 180)).toBeUndefined();
    expect(normaliseBounded(0, 0, 100)).toBe(0);
  });
});

describe('Phase 2: heading normalisation', () => {
  it('wraps out-of-range headings, which are unambiguous', () => {
    expect(normaliseHeading(370)).toBe(10);
    expect(normaliseHeading(-90)).toBe(270);
    expect(normaliseHeading(720)).toBe(0);
  });

  it('preserves a genuine 0 (due north)', () => {
    expect(normaliseHeading(0)).toBe(0);
  });

  it('returns undefined for an absent heading rather than 0', () => {
    // 0 is due north. A substituted 0 points every non-reporting
    // vehicle's arrow the same wrong way.
    expect(normaliseHeading(undefined)).toBeUndefined();
    expect(normaliseHeading(null)).toBeUndefined();
    expect(normaliseHeading('')).toBeUndefined();
  });
});

describe('Phase 2: ignition is tri-state', () => {
  it('accepts booleans, 0/1 and common spellings', () => {
    expect(normaliseIgnition(true)).toBe(true);
    expect(normaliseIgnition(1)).toBe(true);
    expect(normaliseIgnition('ON')).toBe(true);
    expect(normaliseIgnition('yes')).toBe(true);

    expect(normaliseIgnition(false)).toBe(false);
    expect(normaliseIgnition(0)).toBe(false);
    expect(normaliseIgnition('off')).toBe(false);
  });

  it('returns undefined for unreported rather than false', () => {
    // "ignition off" and "this device does not report ignition" are
    // different facts. Idle time is derived from
    // ignition-on-while-stationary, so a substituted false makes every
    // non-reporting vehicle permanently not-idling.
    expect(normaliseIgnition(undefined)).toBeUndefined();
    expect(normaliseIgnition(null)).toBeUndefined();
    expect(normaliseIgnition('maybe')).toBeUndefined();
    expect(normaliseIgnition(2)).toBeUndefined();
  });
});

describe('Phase 2: unit conversion', () => {
  it('converts miles to km with the exact factor', () => {
    expect(milesToKm(1)).toBeCloseTo(1.609344, 6);
    expect(milesToKm(100)).toBeCloseTo(160.9344, 4);
  });
});

describe('Phase 2: compact drops absent members', () => {
  it('removes undefined and null', () => {
    expect(compact({ a: 1, b: undefined, c: null })).toEqual({ a: 1 });
  });

  it('KEEPS a genuine zero', () => {
    // The whole absent-vs-zero rule in one assertion.
    expect(compact({ speed: 0 })).toEqual({ speed: 0 });
  });

  it('returns undefined when nothing survives', () => {
    // So "the provider reported none of these" collapses to an absent
    // container rather than an empty object that looks like a real
    // reading of nothing.
    expect(compact({ a: undefined, b: null })).toBeUndefined();
  });
});
