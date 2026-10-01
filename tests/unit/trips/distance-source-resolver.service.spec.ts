// tests/unit/trips/distance-source-resolver.service.spec.ts
//
// PART 5 -- the Distance Source Hierarchy's own priority order, pinned.
// This resolver is the single place that decides which of several
// available distance measurements becomes a trip's headline figure, so
// its ordering and its refusal to average/blend are the properties that
// matter most here.

import {
  resolveSelectedDistance,
  buildDistanceMeasurement,
} from '@/modules/trips/services/distance-source-resolver.service';
import type { DistanceMeasurement, TripDistanceEvidence } from '@/shared/types/evidence.types';

function measurement(valueKm: number): DistanceMeasurement {
  return buildDistanceMeasurement(valueKm, 'manual', 'test fixture');
}

describe('resolveSelectedDistance', () => {
  it('returns unavailable with a null value when no evidence exists', () => {
    expect(resolveSelectedDistance(undefined)).toEqual({ valueKm: null, source: 'unavailable' });
  });

  it('returns unavailable when evidence exists but every entry is absent', () => {
    expect(resolveSelectedDistance({})).toEqual({ valueKm: null, source: 'unavailable' });
  });

  it('picks GPS over every other source, even when GPS is smaller', () => {
    const evidence: TripDistanceEvidence = {
      gps: measurement(10),
      odometer: measurement(50),
      mapDerived: measurement(45),
      manual: measurement(40),
    };
    const resolved = resolveSelectedDistance(evidence);
    expect(resolved.source).toBe('gps-path');
    expect(resolved.valueKm).toBe(10);
  });

  it('falls back to odometer when GPS is absent', () => {
    const evidence: TripDistanceEvidence = {
      odometer: measurement(52),
      mapDerived: measurement(45),
      manual: measurement(40),
    };
    const resolved = resolveSelectedDistance(evidence);
    expect(resolved.source).toBe('odometer');
    expect(resolved.valueKm).toBe(52);
  });

  it('falls back to map-derived when only GPS and odometer are absent', () => {
    const evidence: TripDistanceEvidence = {
      mapDerived: measurement(45.4),
      manual: measurement(40),
    };
    const resolved = resolveSelectedDistance(evidence);
    expect(resolved.source).toBe('map-derived');
    expect(resolved.valueKm).toBe(45.4);
  });

  it('falls back to manual only when nothing else is usable', () => {
    const evidence: TripDistanceEvidence = { manual: measurement(40) };
    const resolved = resolveSelectedDistance(evidence);
    expect(resolved.source).toBe('manual');
    expect(resolved.valueKm).toBe(40);
  });

  it('never averages or blends -- the selected value is exactly one source\'s figure', () => {
    const evidence: TripDistanceEvidence = {
      gps: measurement(51.8),
      mapDerived: measurement(45.4),
    };
    const resolved = resolveSelectedDistance(evidence);
    // The point under test: NOT (51.8 + 45.4) / 2.
    expect(resolved.valueKm).toBe(51.8);
  });

  it('treats a negative value as unusable and skips to the next source in priority order', () => {
    const evidence: TripDistanceEvidence = {
      gps: { valueKm: -5, source: 'gps-path', method: 'corrupt fixture', calculatedAt: new Date() },
      odometer: measurement(30),
    };
    const resolved = resolveSelectedDistance(evidence);
    expect(resolved.source).toBe('odometer');
    expect(resolved.valueKm).toBe(30);
  });

  it('treats a non-finite value (NaN/Infinity) as unusable', () => {
    const evidence: TripDistanceEvidence = {
      gps: { valueKm: NaN, source: 'gps-path', method: 'corrupt fixture', calculatedAt: new Date() },
      mapDerived: measurement(22),
    };
    expect(resolveSelectedDistance(evidence).source).toBe('map-derived');

    const evidenceInf: TripDistanceEvidence = {
      odometer: { valueKm: Infinity, source: 'odometer', method: 'corrupt fixture', calculatedAt: new Date() },
      manual: measurement(11),
    };
    expect(resolveSelectedDistance(evidenceInf).source).toBe('manual');
  });

  it('accepts exactly zero as a usable value (a genuinely zero-distance trip is not the same as missing data)', () => {
    const evidence: TripDistanceEvidence = { odometer: measurement(0) };
    const resolved = resolveSelectedDistance(evidence);
    expect(resolved.source).toBe('odometer');
    expect(resolved.valueKm).toBe(0);
  });

  it('preserves every sibling measurement -- resolving does not mutate the evidence object', () => {
    const evidence: TripDistanceEvidence = {
      gps: measurement(10),
      odometer: measurement(50),
    };
    const snapshot = JSON.parse(JSON.stringify(evidence));
    resolveSelectedDistance(evidence);
    expect(JSON.parse(JSON.stringify(evidence))).toEqual(snapshot);
  });
});

describe('buildDistanceMeasurement', () => {
  it('stamps calculatedAt and omits reference when none is given', () => {
    const m = buildDistanceMeasurement(12.3, 'map-derived', 'Routing engine (OSRM) over 2 stops');
    expect(m.valueKm).toBe(12.3);
    expect(m.source).toBe('map-derived');
    expect(m.method).toBe('Routing engine (OSRM) over 2 stops');
    expect(m.calculatedAt).toBeInstanceOf(Date);
    expect(m.reference).toBeUndefined();
  });

  it('includes reference when one is given', () => {
    const m = buildDistanceMeasurement(5, 'odometer', 'End odometer − start odometer', 'trip-123');
    expect(m.reference).toBe('trip-123');
  });
});
