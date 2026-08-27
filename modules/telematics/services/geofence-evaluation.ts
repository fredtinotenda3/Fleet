// modules/telematics/services/geofence-evaluation.ts
//
// PHASE 4, F-13 -- making geofence evaluation survive 1,000 vehicles.
//
// ---------------------------------------------------------------------
// THE PROBLEM
// ---------------------------------------------------------------------
// `ingestTelematicsData` calls `checkGeofence` on EVERY location fix,
// and `checkGeofence` began with two unconditional Mongo queries:
//
//   getActiveGeofences(vehicleId, tenantId)          -- query 1
//   getGeofenceStatesForVehicle(vehicleId, ids)      -- query 2
//
// At 1,000 vehicles on a 50-second cadence that is ~2,400 queries per
// minute before a single alert fires -- and it is paid in full by every
// tenant, including the ones that have never drawn a geofence at all.
//
// ---------------------------------------------------------------------
// THE FIX, IN THREE CHEAP LAYERS
// ---------------------------------------------------------------------
// Each layer removes work from the layer below, so the common cases cost
// nothing:
//
//   1. TENANT-LEVEL CACHE of active geofences, short TTL. One query per
//      tenant per TTL window instead of one per vehicle per ping. For a
//      tenant with NO geofences this collapses to zero queries per ping
//      after the first -- which is most tenants, most of the time.
//
//   2. BOUNDING-BOX PREFILTER. A precomputed lat/lng box per geofence,
//      tested with four float comparisons. Only geofences whose box
//      contains the point proceed to real geometry. A vehicle driving
//      across a city touches no box at all, so the expensive
//      point-in-polygon work never runs.
//
//   3. STATE QUERY ONLY FOR CANDIDATES. The second Mongo query now runs
//      only when at least one box matched, and asks about those
//      geofences rather than all of them. A ping nowhere near a
//      boundary costs zero queries.
//
// Net: a fleet whose vehicles are not near a geofence pays ~0 queries
// per ping instead of 2. A vehicle actually near one pays 1.
//
// ---------------------------------------------------------------------
// WHY AN IN-PROCESS CACHE IS ACCEPTABLE HERE
// ---------------------------------------------------------------------
// It is per-process, so several instances each hold their own copy and a
// geofence edit takes up to the TTL to be seen everywhere. That is
// tolerable for this specific data and would not be for most:
//
//   * geofences are operator-drawn and change on a human timescale --
//     minutes to months, not seconds;
//   * the TTL is short (30s), so the worst case is one missed
//     evaluation cycle;
//   * `invalidateTenant()` is called on every geofence write, so an edit
//     made through the app is visible immediately in the process that
//     made it.
//
// It is deliberately NOT the shared query cache in
// infrastructure/cache/: that layer is keyed by tenant only and is
// invalidate-only (the audit's F-9), so wiring a hot path into it would
// inherit a known-broken component.
//
// A geofence is never cached across tenants: the cache key IS the tenant
// id, and `getActiveGeofences` is already tenant-scoped, so a miss
// cannot return another tenant's boundaries.

import { Geofence, CircleCoordinates, PolygonCoordinates } from '../types/telematics.types';

/** How long a tenant's active-geofence list is reused. */
export const GEOFENCE_CACHE_TTL_MS = 30_000;

/** Mean Earth radius, km. Used to convert a circle radius into degrees. */
const EARTH_RADIUS_KM = 6371;

export interface GeofenceBoundingBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export interface CachedGeofence {
  geofence: Geofence;
  /** Null when the shape has no computable box -- see boundingBoxFor. */
  box: GeofenceBoundingBox | null;
}

interface CacheEntry {
  entries: CachedGeofence[];
  expiresAt: number;
}

const cacheByTenant = new Map<string, CacheEntry>();

/**
 * A conservative lat/lng box containing the shape.
 *
 * MUST NEVER BE TIGHTER THAN THE SHAPE. A box that excludes a point the
 * real geometry would have included is a silently missed alert -- the
 * failure mode nobody notices until an asset leaves a site and nothing
 * fires. Every branch below therefore rounds outward, and any shape this
 * function cannot bound returns `null`, which means "always evaluate"
 * rather than "never evaluate".
 */
export function boundingBoxFor(geofence: Geofence): GeofenceBoundingBox | null {
  if (geofence.type === 'circle') {
    const c = geofence.coordinates as CircleCoordinates;
    if (
      typeof c?.center?.lat !== 'number' ||
      typeof c?.center?.lng !== 'number' ||
      typeof c?.radius !== 'number' ||
      !Number.isFinite(c.radius)
    ) {
      return null;
    }

    // `radius` is metres elsewhere in this codebase (see
    // isPointInGeofence's haversine comparison), so convert to km first.
    const radiusKm = c.radius / 1000;
    const latDelta = (radiusKm / EARTH_RADIUS_KM) * (180 / Math.PI);

    // Longitude degrees shrink with latitude. Guard the cosine against
    // ~0 near the poles, where a degree of longitude is metres wide and
    // the division would explode into an infinite box.
    const cosLat = Math.cos((c.center.lat * Math.PI) / 180);
    const lngDelta =
      Math.abs(cosLat) < 1e-6 ? 180 : (radiusKm / (EARTH_RADIUS_KM * Math.abs(cosLat))) * (180 / Math.PI);

    return {
      minLat: c.center.lat - latDelta,
      maxLat: c.center.lat + latDelta,
      minLng: c.center.lng - lngDelta,
      maxLng: c.center.lng + lngDelta,
    };
  }

  if (geofence.type === 'polygon') {
    const p = geofence.coordinates as PolygonCoordinates;
    const points = p?.points;
    if (!Array.isArray(points) || points.length === 0) return null;

    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLng = Infinity;
    let maxLng = -Infinity;

    for (const point of points) {
      if (typeof point?.lat !== 'number' || typeof point?.lng !== 'number') return null;
      if (point.lat < minLat) minLat = point.lat;
      if (point.lat > maxLat) maxLat = point.lat;
      if (point.lng < minLng) minLng = point.lng;
      if (point.lng > maxLng) maxLng = point.lng;
    }

    return { minLat, maxLat, minLng, maxLng };
  }

  // 'route' geofences carry a tolerance corridor around a path. Bounding
  // one correctly means expanding the path's box by the tolerance, and
  // nothing in this codebase evaluates route geofences yet (the audit
  // records route deviation as unimplemented). Returning null keeps them
  // on the always-evaluate path rather than inventing a box that might
  // exclude a real crossing.
  return null;
}

/**
 * Does the point fall inside the box?
 *
 * `null` means the shape could not be bounded, so the answer is yes --
 * fail towards evaluating rather than skipping. A prefilter that skips
 * is a missed alert; a prefilter that over-includes only costs one
 * geometry call.
 */
export function isPointInBox(
  point: { lat: number; lng: number },
  box: GeofenceBoundingBox | null
): boolean {
  if (!box) return true;
  return (
    point.lat >= box.minLat &&
    point.lat <= box.maxLat &&
    point.lng >= box.minLng &&
    point.lng <= box.maxLng
  );
}

/**
 * The tenant's active geofences, from cache when warm.
 *
 * `loader` is injected so this module has no repository dependency and
 * can be tested without a database.
 */
export async function getCachedGeofences(
  tenantId: string,
  loader: () => Promise<Geofence[]>,
  now: number = Date.now()
): Promise<CachedGeofence[]> {
  const cached = cacheByTenant.get(tenantId);
  if (cached && cached.expiresAt > now) return cached.entries;

  const geofences = await loader();
  // Boxes are computed ONCE per cache fill, not per ping. That is the
  // point of caching the derived form rather than the raw documents.
  const entries: CachedGeofence[] = geofences.map((geofence) => ({
    geofence,
    box: boundingBoxFor(geofence),
  }));

  cacheByTenant.set(tenantId, { entries, expiresAt: now + GEOFENCE_CACHE_TTL_MS });
  return entries;
}

/**
 * Narrows a tenant's geofences to those whose box contains the point.
 *
 * The prefilter is deliberately cheap and deliberately generous: four
 * float comparisons, and anything unbounded passes through.
 */
export function candidatesFor(
  entries: CachedGeofence[],
  point: { lat: number; lng: number }
): Geofence[] {
  const candidates: Geofence[] = [];
  for (const entry of entries) {
    if (isPointInBox(point, entry.box)) candidates.push(entry.geofence);
  }
  return candidates;
}

/**
 * Drops a tenant's cached list.
 *
 * Called on every geofence create/update/delete so an operator editing a
 * boundary sees it applied immediately rather than up to a TTL later.
 */
export function invalidateTenantGeofences(tenantId: string): void {
  cacheByTenant.delete(tenantId);
}

/** TEST ONLY. Clears every tenant's cache. */
export function resetGeofenceCache(): void {
  cacheByTenant.clear();
}

/** Diagnostic: how many tenants are currently cached. */
export function cachedTenantCount(): number {
  return cacheByTenant.size;
}
