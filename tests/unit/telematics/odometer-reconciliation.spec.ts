// tests/unit/telematics/odometer-reconciliation.spec.ts
//
// PHASE 1 regression suite for the odometer overwrite guard.
//
// THE DEFECT: digital-twin.service.ts resolved the vehicle's odometer as
//
//   latestTelemetry?.trip?.odometer ?? vehicle.odometer ?? 0
//
// `??` only falls through on null/undefined, so ANY telemetry value beat
// the vehicle record -- a fabricated 0 (F-2), a rolled-back reading from
// a replaced head unit, a garbled value with an extra digit, or a
// month-old fix replayed by a device that had been buffering offline.
//
// Fixing F-2 removes the fabricated zeros but not this: the PRECEDENCE
// itself was wrong.

import {
  resolveOdometer,
  REGRESSION_TOLERANCE_KM,
  IMPLAUSIBLE_JUMP_KM,
} from '@/modules/telematics/services/odometer-reconciliation';

describe('Phase 1: odometer overwrite guard', () => {
  describe('missing or unusable telemetry', () => {
    it('keeps the vehicle record when telemetry has no odometer', () => {
      const r = resolveOdometer(undefined, 128_400);
      expect(r.value).toBe(128_400);
      expect(r.source).toBe('vehicle');
      // Not a rejection worth flagging -- most providers simply do not
      // report an odometer, and an alert per poll would be noise.
      expect(r.rejected).toBeUndefined();
    });

    it('keeps the vehicle record when telemetry is null', () => {
      expect(resolveOdometer(null, 128_400).value).toBe(128_400);
    });

    it('REJECTS a telemetry odometer of exactly 0 and flags it', () => {
      // The F-2 signature: a fabricated default, or a freshly-reset head
      // unit. Either way it is not a measurement.
      const r = resolveOdometer(0, 128_400);
      expect(r.value).toBe(128_400);
      expect(r.source).toBe('vehicle');
      expect(r.rejected?.reason).toBe('zero');
    });

    it('rejects a zero even when there is no baseline to fall back to', () => {
      // A vehicle genuinely reading 0 km has never been driven, and that
      // belongs in the vehicle record rather than arriving as a
      // telemetry override.
      const r = resolveOdometer(0, undefined);
      expect(r.value).toBeNull();
      expect(r.source).toBe('none');
      expect(r.rejected?.reason).toBe('zero');
    });

    it('rejects NaN, Infinity and negatives', () => {
      for (const bad of [NaN, Infinity, -Infinity, -5]) {
        expect(resolveOdometer(bad, 1000).value).toBe(1000);
      }
    });
  });

  describe('monotonicity', () => {
    it('REJECTS a lower reading and flags it as a regression', () => {
      // The replaced-head-unit case: readings drop by tens of thousands
      // of km overnight.
      const r = resolveOdometer(12_000, 128_400);
      expect(r.value).toBe(128_400);
      expect(r.source).toBe('vehicle');
      expect(r.rejected?.reason).toBe('regression');
      expect(r.rejected?.candidate).toBe(12_000);
    });

    it('tolerates sub-kilometre rounding differences', () => {
      // Providers round: one reports 34853.05, the next 34853. A strict
      // `<` would reject the second forever.
      const r = resolveOdometer(34_853, 34_853.05);
      expect(r.value).toBe(34_853);
      expect(r.source).toBe('telemetry');
      expect(r.rejected).toBeUndefined();
    });

    it('rejects a drop just beyond the rounding tolerance', () => {
      const r = resolveOdometer(1000 - REGRESSION_TOLERANCE_KM - 0.5, 1000);
      expect(r.rejected?.reason).toBe('regression');
    });

    it('accepts an equal reading', () => {
      const r = resolveOdometer(128_400, 128_400);
      expect(r.value).toBe(128_400);
      expect(r.rejected).toBeUndefined();
    });
  });

  describe('plausibility ceiling', () => {
    it('ACCEPTS a valid higher reading', () => {
      const r = resolveOdometer(128_950, 128_400);
      expect(r.value).toBe(128_950);
      expect(r.source).toBe('telemetry');
      expect(r.rejected).toBeUndefined();
    });

    it('accepts a large but legitimate catch-up after an offline period', () => {
      // A long-haul truck covers ~2,500 km/week; a device offline for a
      // fortnight legitimately arrives with a big gap. The ceiling must
      // not reject exactly the catch-up readings that matter most.
      const r = resolveOdometer(128_400 + 4_500, 128_400);
      expect(r.source).toBe('telemetry');
    });

    it('REJECTS an implausible jump and flags it', () => {
      // An extra digit: 128,400 -> 1,284,000.
      const r = resolveOdometer(1_284_000, 128_400);
      expect(r.value).toBe(128_400);
      expect(r.source).toBe('vehicle');
      expect(r.rejected?.reason).toBe('implausible-jump');
    });

    it('uses an absolute ceiling, not a ratio of the current value', () => {
      // A ratio behaves worst where readings are least reliable. Under a
      // "> 2x" rule a new vehicle at 400 km would be refused at 800 km
      // (legitimate within a fortnight), while a truck at 400,000 km
      // would ACCEPT 799,000 km -- an obvious garble -- because it falls
      // under 2x. These two assertions would both fail under a ratio.
      expect(resolveOdometer(800, 400).source).toBe('telemetry');
      expect(resolveOdometer(799_000, 400_000).rejected?.reason).toBe(
        'implausible-jump'
      );
    });

    it('accepts a reading exactly at the ceiling', () => {
      const r = resolveOdometer(1000 + IMPLAUSIBLE_JUMP_KM, 1000);
      expect(r.source).toBe('telemetry');
    });
  });

  describe('no baseline', () => {
    it('accepts a plausible reading when the vehicle has no odometer', () => {
      const r = resolveOdometer(45_000, undefined);
      expect(r.value).toBe(45_000);
      expect(r.source).toBe('telemetry');
    });

    it('reports none when neither side has a value', () => {
      const r = resolveOdometer(undefined, undefined);
      expect(r.value).toBeNull();
      expect(r.source).toBe('none');
    });
  });

  describe('determinism', () => {
    it('returns the same answer for the same inputs', () => {
      const runs = Array.from({ length: 20 }, () => resolveOdometer(1_284_000, 128_400));
      const distinct = new Set(runs.map((r) => JSON.stringify(r)));
      expect(distinct.size).toBe(1);
    });
  });
});
