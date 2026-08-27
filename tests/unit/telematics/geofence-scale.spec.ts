// tests/unit/telematics/geofence-scale.spec.ts
//
// PHASE 4, F-13 -- geofence evaluation at 1,000 vehicles.
//
// The defect: `checkGeofence` ran on EVERY location fix and began with
// two unconditional Mongo queries -- ~2,400 queries/minute at 1,000
// vehicles on a 50s cadence, paid in full even by tenants that have
// never drawn a geofence.

import {
  getCachedGeofences,
  candidatesFor,
  boundingBoxFor,
  isPointInBox,
  invalidateTenantGeofences,
  resetGeofenceCache,
  GEOFENCE_CACHE_TTL_MS,
} from '@/modules/telematics/services/geofence-evaluation';
import { Geofence } from '@/modules/telematics/types/telematics.types';

function circle(lat: number, lng: number, radiusMetres: number): Geofence {
  return {
    _id: `circle-${lat}-${lng}`,
    name: 'Depot',
    type: 'circle',
    coordinates: { center: { lat, lng }, radius: radiusMetres },
    active: true,
    alerts: { entry: true, exit: true, inside: false },
    tenantId: 'tenant-a',
  } as unknown as Geofence;
}

function polygon(points: Array<{ lat: number; lng: number }>): Geofence {
  return {
    _id: 'poly-1',
    name: 'Yard',
    type: 'polygon',
    coordinates: { points },
    active: true,
    alerts: { entry: true, exit: true, inside: false },
    tenantId: 'tenant-a',
  } as unknown as Geofence;
}

beforeEach(() => resetGeofenceCache());

describe('F-13: the tenant geofence cache', () => {
  it('loads once and reuses within the TTL', async () => {
    const loader = jest.fn().mockResolvedValue([circle(-17.82, 31.05, 500)]);

    await getCachedGeofences('tenant-a', loader, 1000);
    await getCachedGeofences('tenant-a', loader, 1000 + GEOFENCE_CACHE_TTL_MS - 1);
    await getCachedGeofences('tenant-a', loader, 1000 + GEOFENCE_CACHE_TTL_MS - 1);

    // Was one query PER PING. Now one per tenant per TTL window.
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('reloads after the TTL expires', async () => {
    const loader = jest.fn().mockResolvedValue([]);

    await getCachedGeofences('tenant-a', loader, 1000);
    await getCachedGeofences('tenant-a', loader, 1000 + GEOFENCE_CACHE_TTL_MS + 1);

    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('caches an EMPTY result, so a tenant with no geofences costs nothing', async () => {
    // The common case, and the one that mattered most: these tenants
    // used to pay two queries per ping for nothing.
    const loader = jest.fn().mockResolvedValue([]);

    await getCachedGeofences('tenant-a', loader, 1000);
    await getCachedGeofences('tenant-a', loader, 1500);
    await getCachedGeofences('tenant-a', loader, 2000);

    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('NEVER serves one tenant from another tenant cache entry', async () => {
    const loaderA = jest.fn().mockResolvedValue([circle(-17.82, 31.05, 500)]);
    const loaderB = jest.fn().mockResolvedValue([]);

    const a = await getCachedGeofences('tenant-a', loaderA, 1000);
    const b = await getCachedGeofences('tenant-b', loaderB, 1000);

    expect(a).toHaveLength(1);
    expect(b).toHaveLength(0);
    expect(loaderB).toHaveBeenCalledTimes(1);
  });

  it('invalidation drops only the named tenant', async () => {
    const loaderA = jest.fn().mockResolvedValue([]);
    const loaderB = jest.fn().mockResolvedValue([]);

    await getCachedGeofences('tenant-a', loaderA, 1000);
    await getCachedGeofences('tenant-b', loaderB, 1000);

    invalidateTenantGeofences('tenant-a');

    await getCachedGeofences('tenant-a', loaderA, 1100);
    await getCachedGeofences('tenant-b', loaderB, 1100);

    expect(loaderA).toHaveBeenCalledTimes(2);
    expect(loaderB).toHaveBeenCalledTimes(1);
  });
});

describe('F-13: bounding boxes must never be tighter than the shape', () => {
  it('bounds a circle generously enough to contain its edge', () => {
    // A box that excludes a point the real geometry would include is a
    // SILENTLY MISSED ALERT -- the failure nobody notices until an asset
    // leaves a site and nothing fires.
    const g = circle(-17.82, 31.05, 1000);
    const box = boundingBoxFor(g)!;

    // ~1km north of centre is inside a 1km-radius circle's box.
    expect(isPointInBox({ lat: -17.82 + 0.0089, lng: 31.05 }, box)).toBe(true);
    // ~5km away is not.
    expect(isPointInBox({ lat: -17.82 + 0.05, lng: 31.05 }, box)).toBe(false);
  });

  it('bounds a polygon by its extremes', () => {
    const box = boundingBoxFor(
      polygon([
        { lat: -17.8, lng: 31.0 },
        { lat: -17.9, lng: 31.1 },
        { lat: -17.85, lng: 31.05 },
      ])
    )!;

    expect(box.minLat).toBe(-17.9);
    expect(box.maxLat).toBe(-17.8);
    expect(box.minLng).toBe(31.0);
    expect(box.maxLng).toBe(31.1);
  });

  it('returns null for a shape it cannot bound, meaning ALWAYS evaluate', () => {
    // Fails towards evaluating. A prefilter that skips is a missed
    // alert; one that over-includes costs a single geometry call.
    expect(
      boundingBoxFor({
        _id: 'r1',
        type: 'route',
        coordinates: { points: [], tolerance: 50 },
      } as unknown as Geofence)
    ).toBeNull();

    expect(isPointInBox({ lat: 0, lng: 0 }, null)).toBe(true);
  });

  it('returns null for malformed coordinates rather than a wrong box', () => {
    expect(
      boundingBoxFor({ _id: 'c', type: 'circle', coordinates: {} } as unknown as Geofence)
    ).toBeNull();
    expect(
      boundingBoxFor({
        _id: 'p',
        type: 'polygon',
        coordinates: { points: [{ lat: 'x', lng: 1 }] },
      } as unknown as Geofence)
    ).toBeNull();
  });

  it('does not produce an infinite box near the poles', () => {
    // Longitude degrees shrink with latitude; an unguarded cosine
    // division explodes.
    const box = boundingBoxFor(circle(89.999, 0, 1000))!;
    expect(Number.isFinite(box.minLng)).toBe(true);
    expect(Number.isFinite(box.maxLng)).toBe(true);
  });
});

describe('F-13: the prefilter narrows correctly', () => {
  it('keeps only geofences whose box contains the point', async () => {
    const near = circle(-17.82, 31.05, 500);
    const far = circle(-20.15, 28.58, 500); // Bulawayo, ~440km away

    const entries = await getCachedGeofences('tenant-a', async () => [near, far], 1000);
    const candidates = candidatesFor(entries, { lat: -17.82, lng: 31.05 });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]._id).toBe(near._id);
  });

  it('returns nothing when the vehicle is near no geofence', async () => {
    // The path that removes the SECOND Mongo query: no candidates means
    // the geofence-state read never runs.
    const entries = await getCachedGeofences(
      'tenant-a',
      async () => [circle(-20.15, 28.58, 500)],
      1000
    );

    expect(candidatesFor(entries, { lat: -17.82, lng: 31.05 })).toHaveLength(0);
  });

  it('always includes an unbounded shape', async () => {
    const route = {
      _id: 'r1',
      type: 'route',
      coordinates: { points: [{ lat: 1, lng: 1 }], tolerance: 50 },
      active: true,
      alerts: { entry: true, exit: true, inside: false },
    } as unknown as Geofence;

    const entries = await getCachedGeofences('tenant-a', async () => [route], 1000);
    expect(candidatesFor(entries, { lat: -90, lng: 180 })).toHaveLength(1);
  });
});

describe('F-13: the ingestion path still evaluates geofences', () => {
  it('checkGeofence uses the cache and the prefilter', () => {
    // Structural guard: this fails if someone reverts to the
    // unconditional per-ping queries.
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../../modules/telematics/services/telematics.service.ts'),
      'utf8'
    );

    expect(src).toContain('getCachedGeofences(tenantId');
    expect(src).toContain('candidatesFor(cached, location)');
    // The state query must be AFTER the prefilter, not unconditional.
    expect(src.indexOf('candidatesFor(cached, location)')).toBeLessThan(
      src.indexOf('getGeofenceStatesForVehicle')
    );
  });

  it('every geofence write invalidates the cache', () => {
    // Otherwise an operator's edit would not apply for up to a TTL --
    // including a newly-synced provider boundary.
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.resolve(
        __dirname,
        '../../../modules/telematics/repositories/telematics.repository.ts'
      ),
      'utf8'
    );

    // create, update, delete, and the provider trigger upsert.
    expect(src.match(/invalidateTenantGeofences\(tenantId\)/g)?.length).toBeGreaterThanOrEqual(4);
  });
});
