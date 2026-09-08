// tests/security/trip-playback-scope.spec.ts
//
// Playback returns a vehicle's movement history, which is among the most
// sensitive things this platform holds -- where a named vehicle was,
// minute by minute. So its scope properties are asserted rather than
// reviewed.
//
// `downsamplePoints` is tested directly because it is arithmetic, and
// because the failure it prevents (a route whose END is missing, reading
// as a vehicle that stopped somewhere it did not) is silent.

import { downsamplePoints, MAX_PLAYBACK_POINTS } from '../../modules/trips/services/trip-playback.service';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const serviceSrc = read('modules/trips/services/trip-playback.service.ts');

describe('downsamplePoints', () => {
  const track = (n: number) => Array.from({ length: n }, (_, i) => i);

  it('returns a short track untouched', () => {
    expect(downsamplePoints(track(10), 100)).toEqual(track(10));
  });

  it('returns a track of exactly the cap untouched', () => {
    expect(downsamplePoints(track(100), 100)).toEqual(track(100));
  });

  it('REGRESSION: always keeps the first and last point', () => {
    // A `.slice(0, max)` would drop the tail, so every long trip would
    // render as ending somewhere the vehicle never stopped.
    const out = downsamplePoints(track(10_000), 500);
    expect(out).toHaveLength(500);
    expect(out[0]).toBe(0);
    expect(out[out.length - 1]).toBe(9_999);
  });

  it('samples evenly rather than clustering', () => {
    // Asserted as a PROPERTY, not as fixed indices. Even sampling uses
    // `Math.round(i * step)` with a fractional step, so the values are
    // near-multiples rather than exact ones (999/10 = 99.9 gives 599,
    // not 600). Pinning exact indices would be asserting the rounding,
    // which is not the behaviour that matters.
    const out = downsamplePoints(track(1_000), 11);
    expect(out).toHaveLength(11);
    expect(out[0]).toBe(0);
    expect(out[10]).toBe(999);

    // Strictly increasing, and every gap within one of the ideal stride.
    const stride = 999 / 10;
    for (let i = 1; i < out.length; i += 1) {
      expect(out[i]).toBeGreaterThan(out[i - 1]);
      expect(Math.abs(out[i] - out[i - 1] - stride)).toBeLessThanOrEqual(1);
    }
  });

  it('handles a two-point track and a degenerate cap', () => {
    expect(downsamplePoints(track(2), 2)).toEqual([0, 1]);
    expect(downsamplePoints(track(50), 1)).toEqual(track(50));
    expect(downsamplePoints([], 10)).toEqual([]);
  });
});

describe('trip playback: scope', () => {
  it('loads the trip under the caller context BEFORE reading telemetry', () => {
    // Order is the property: a telemetry read that happens before the
    // scope check has already produced the data it was meant to protect.
    const tripAt = serviceSrc.indexOf('tripRepository.findById');
    const scopeAt = serviceSrc.indexOf('canAccessOrgUnit');
    const telemetryAt = serviceSrc.indexOf("collection('tbltelematics')");

    expect(tripAt).toBeGreaterThan(-1);
    expect(scopeAt).toBeGreaterThan(tripAt);
    expect(telemetryAt).toBeGreaterThan(scopeAt);
  });

  it('reports an out-of-scope trip as NOT FOUND, never as forbidden', () => {
    // A distinguishable "exists but hidden" response lets a
    // scope-narrowed caller enumerate another branch's trips one id at a
    // time -- the same rule vehicle-write-resolver documents.
    expect(serviceSrc).toMatch(/canAccessOrgUnit[\s\S]{0,120}NotFoundError\('Trip not found'\)/);
    expect(serviceSrc).not.toMatch(/ForbiddenError/);
  });

  it('fails closed on a trip with no org unit for a scoped caller', () => {
    expect(serviceSrc).toMatch(
      /!tripOrgUnitId && context\.accessibleOrgUnitIds !== null[\s\S]{0,80}NotFoundError/
    );
  });

  it('takes the vehicle from the TRIP, never from the request', () => {
    // Otherwise a caller could aim the telemetry query at any vehicle by
    // pairing a trip they can see with a vehicleId they cannot.
    const start = serviceSrc.indexOf('async getPlayback(');
    const body = serviceSrc.slice(start);
    expect(body).toMatch(/trip\.generation_vehicle_id/);
    expect(body).toMatch(/trip\.license_plate/);
    // No vehicle identifier is accepted as an argument.
    expect(serviceSrc).toMatch(/async getPlayback\(tripId: string, context: TenantContext\)/);
  });

  it('filters the telemetry read by tenant and vehicle', () => {
    const query = serviceSrc.slice(serviceSrc.indexOf("collection('tbltelematics')"));
    expect(query).toMatch(/tenantId: context\.organizationId/);
    expect(query).toMatch(/vehicleId,/);
  });
});

describe('trip playback: honest output', () => {
  it('bounds the query so a chatty vehicle cannot exhaust memory', () => {
    expect(serviceSrc).toMatch(/\.limit\(MAX_PLAYBACK_POINTS \* 8\)/);
    expect(MAX_PLAYBACK_POINTS).toBeGreaterThan(100);
  });

  it('says when the track was thinned', () => {
    // A decimated path must never be shown as though it were complete.
    expect(serviceSrc).toMatch(/downsampled: points\.length < located\.length/);
  });

  it('says WHY a track is empty', () => {
    // An empty array with no explanation is the silence this codebase
    // has repeatedly been bitten by.
    for (const reason of ['no-time-window', 'no-vehicle-reference', 'no-readings']) {
      expect(serviceSrc).toContain(reason);
    }
  });

  it('never defaults speed or heading', () => {
    // `speed: 0` reads as stationary; `heading: 0` points every
    // unreported vehicle due north.
    expect(serviceSrc).toMatch(/typeof r\.location!\.speed === 'number' \? \{ speed:/);
    expect(serviceSrc).toMatch(/typeof r\.location!\.heading === 'number' \? \{ heading:/);
    expect(serviceSrc).not.toMatch(/speed:\s*r\.location.*\?\?\s*0/);
  });

  it('orders readings ascending, as a scrubber requires', () => {
    expect(serviceSrc).toMatch(/\.sort\(\{ timestamp: 1 \}\)/);
  });
});

describe('trip playback: the route', () => {
  const routeSrc = read('app/api/trips/[id]/playback/route.ts');

  it('requires TRIP_VIEW', () => {
    expect(routeSrc).toMatch(/Permission\.TRIP_VIEW/);
    expect(routeSrc).toMatch(/withAuth</);
  });
});
