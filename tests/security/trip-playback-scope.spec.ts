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

jest.mock('../../modules/trips/repositories/trip.repository', () => ({
  tripRepository: { findById: jest.fn() },
  TripRepository: class {},
}));
jest.mock('../../infrastructure/database/mongodb', () => ({ __esModule: true, default: jest.fn() }));

import {
  downsamplePoints,
  MAX_PLAYBACK_POINTS,
  tripPlaybackService,
} from '../../modules/trips/services/trip-playback.service';
import { tripRepository } from '../../modules/trips/repositories/trip.repository';
import connectToDatabase from '../../infrastructure/database/mongodb';
import * as fs from 'fs';
import * as path from 'path';

const findById = tripRepository.findById as jest.Mock;
const connect = connectToDatabase as unknown as jest.Mock;

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

/**
 * These three were originally source-text assertions -- they matched on
 * `canAccessOrgUnit` and on the literal shape of the two-step no-org-unit
 * check. That made them break when the check was consolidated into
 * `tenantScopeService.canAccessRecord`, even though the behaviour they
 * described got STRICTER rather than weaker.
 *
 * Rewritten as behavioural assertions, for the same reason the allocation
 * suite's `expect(code).toContain('FuelLogCreated')` was: matching source
 * text proves a literal is present, not that it means anything. What
 * matters here is that the call refuses, and that it refuses BEFORE any
 * telemetry is read.
 */
describe('trip playback: scope', () => {
  const HARARE = 'branch-harare';
  const BULAWAYO = 'branch-bulawayo';

  const context = (accessibleOrgUnitIds: string[] | null) =>
    ({
      organizationId: 'willsgrove-farm-enterprises-9e80ed',
      organizationName: 'Willsgrove',
      accessibleOrgUnitIds,
      assignedOrgUnitIds: accessibleOrgUnitIds ?? [],
      isPlatformScope: false,
    }) as never;

  const trip = (orgUnitId: string | undefined) => ({
    _id: 'trip-1',
    license_plate: 'AFU0078',
    orgUnitId,
    tenantId: 'willsgrove-farm-enterprises-9e80ed',
    start_time: new Date('2026-09-01T06:00:00Z'),
    end_time: new Date('2026-09-01T07:00:00Z'),
    generation_vehicle_id: 'veh-1',
  });

  beforeEach(() => {
    findById.mockReset();
    connect.mockReset();
    // Any telemetry read at all is a failure in these cases, so the
    // stub throws rather than returning empty: a silent [] would let a
    // leak pass as "no data".
    connect.mockImplementation(() => {
      throw new Error('telemetry must not be read for an out-of-scope trip');
    });
  });

  it('refuses an out-of-scope trip before reading any telemetry', async () => {
    findById.mockResolvedValue(trip(BULAWAYO));
    await expect(
      tripPlaybackService.getPlayback('trip-1', context([HARARE]))
    ).rejects.toThrow('Trip not found');
    expect(connect).not.toHaveBeenCalled();
  });

  it('reports an out-of-scope trip identically to a missing one', async () => {
    // A distinguishable "exists but hidden" response lets a
    // scope-narrowed caller enumerate another branch's trips one id at a
    // time -- the same rule vehicle-write-resolver documents.
    findById.mockResolvedValueOnce(trip(BULAWAYO)).mockResolvedValueOnce(null);

    const outOfScope = await tripPlaybackService
      .getPlayback('trip-1', context([HARARE]))
      .catch((e: Error) => e);
    const missing = await tripPlaybackService
      .getPlayback('trip-ghost', context([HARARE]))
      .catch((e: Error) => e);

    expect((outOfScope as Error).message).toBe((missing as Error).message);
    expect(serviceSrc).not.toMatch(/ForbiddenError/);
  });

  it('fails closed on a trip with no org unit for a scoped caller', async () => {
    // The row is invisible in that caller's trip LIST (a `$in` never
    // matches a missing field), so it must be unreachable by id too.
    findById.mockResolvedValue(trip(undefined));
    await expect(
      tripPlaybackService.getPlayback('trip-1', context([HARARE]))
    ).rejects.toThrow('Trip not found');
    expect(connect).not.toHaveBeenCalled();
  });

  it('still serves an org-wide caller a trip with no org unit', async () => {
    // The tightening must not make unassigned rows unreadable by
    // everyone -- an org-wide role is how an admin inspects them.
    findById.mockResolvedValue(trip(undefined));
    connect.mockResolvedValue({
      collection: () => ({
        find: () => ({
          sort: () => ({ limit: () => ({ toArray: async () => [] }) }),
        }),
      }),
    });

    const playback = await tripPlaybackService.getPlayback('trip-1', context(null));
    expect(playback.emptyReason).toBe('no-readings');
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
