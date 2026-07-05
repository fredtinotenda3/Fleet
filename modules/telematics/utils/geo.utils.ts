// modules/telematics/utils/geo.utils.ts

export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_METERS = 6_371_000;

/**
 * Great-circle distance between two points, in meters.
 */
export function haversineDistanceMeters(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);

  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);

  const h =
    sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;

  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));

  return EARTH_RADIUS_METERS * c;
}

/**
 * Point-in-circle test using haversine distance against the radius.
 */
export function isPointInCircle(
  point: LatLng,
  center: LatLng,
  radiusMeters: number
): boolean {
  return haversineDistanceMeters(point, center) <= radiusMeters;
}

/**
 * Point-in-polygon test via ray casting (even-odd rule), operating on
 * lat/lng directly. This is the standard approach for geofences of city
 * scale or smaller, where treating lat/lng as planar coordinates
 * introduces negligible error; for very large polygons spanning many
 * degrees of latitude a proper spherical/geodesic test would be needed,
 * but that is out of scope for fleet geofencing use cases.
 */
export function isPointInPolygon(point: LatLng, polygon: LatLng[]): boolean {
  if (polygon.length < 3) return false;

  let inside = false;
  const { lat: x, lng: y } = point;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lat;
    const yi = polygon[i].lng;
    const xj = polygon[j].lat;
    const yj = polygon[j].lng;

    const intersects =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;

    if (intersects) inside = !inside;
  }

  return inside;
}

/**
 * Shortest distance in meters from a point to a line segment defined by
 * two lat/lng endpoints. Used for route-corridor geofences (e.g. "alert
 * if vehicle strays more than 200m from this delivery route").
 *
 * Projects the point onto the segment in an equirectangular approximation
 * local to the segment, which is accurate for segment lengths typical of
 * route geofencing (street/highway scale, not transcontinental).
 */
export function distanceToSegmentMeters(
  point: LatLng,
  segStart: LatLng,
  segEnd: LatLng
): number {
  // Convert to a local planar approximation (meters) using the segment's
  // midpoint latitude for the longitude scale factor.
  const midLat = (segStart.lat + segEnd.lat) / 2;
  const latToM = 111_320; // meters per degree latitude (approx, constant)
  const lngToM = 111_320 * Math.cos((midLat * Math.PI) / 180);

  const toXY = (p: LatLng) => ({
    x: p.lng * lngToM,
    y: p.lat * latToM,
  });

  const p = toXY(point);
  const a = toXY(segStart);
  const b = toXY(segEnd);

  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lengthSq = abx * abx + aby * aby;

  let t = lengthSq === 0 ? 0 : ((p.x - a.x) * abx + (p.y - a.y) * aby) / lengthSq;
  t = Math.max(0, Math.min(1, t));

  const closest = { x: a.x + t * abx, y: a.y + t * aby };
  const dx = p.x - closest.x;
  const dy = p.y - closest.y;

  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Point-in-route-corridor test: true if the point is within `tolerance`
 * meters of any segment of the polyline.
 */
export function isPointNearRoute(
  point: LatLng,
  routePoints: LatLng[],
  toleranceMeters: number
): boolean {
  if (routePoints.length < 2) {
    // Single-point "route" degenerates to a circle check.
    return routePoints.length === 1
      ? isPointInCircle(point, routePoints[0], toleranceMeters)
      : false;
  }

  for (let i = 0; i < routePoints.length - 1; i++) {
    const dist = distanceToSegmentMeters(point, routePoints[i], routePoints[i + 1]);
    if (dist <= toleranceMeters) return true;
  }

  return false;
}