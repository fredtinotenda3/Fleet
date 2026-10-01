// modules/telematics/services/route-distance.service.ts
//
// MAP-DERIVED ROUTE DISTANCE (PART 3/4) -- the routing half of the
// map-assisted trip log. Given an ordered list of stops (start,
// waypoints, end), asks a real road-network routing engine for the
// distance along actual roads between them, NOT a straight-line
// (haversine) estimate.
//
// ---------------------------------------------------------------------
// WHY A ROAD-NETWORK ROUTER, NOT HAVERSINE
// ---------------------------------------------------------------------
// `modules/telematics/utils/geo.utils.ts` already has
// `haversineDistanceMeters` for geofencing, and it would be the cheap
// choice here too. It is deliberately NOT used for this feature: PART 4
// asks for a "route distance" the way a map application reports one --
// following roads -- and a straight-line distance between Mt Pleasant
// and Borrowdale understates a real drive by however much the road
// network bends, which is exactly the kind of quietly-wrong number this
// upgrade exists to prevent. If this ever needs to run with no network
// route available, the correct behaviour is UNAVAILABLE with a reason,
// not a silent haversine substitute mislabelled as a route.
//
// ---------------------------------------------------------------------
// PROVIDER CHOICE
// ---------------------------------------------------------------------
// OSRM's public demo server (router.project-osrm.org), the same
// no-key/no-billing basis this codebase already uses for OSM map tiles
// and Nominatim geocoding. Its usage policy asks for moderate,
// non-bulk use; a process-wide throttle below is the same discipline
// reverse-geocode.service.ts applies to Nominatim, sized independently
// since this is a different host with its own limit.
//
// ---------------------------------------------------------------------
// FAILURE IS AN ANSWER, NOT A FABRICATION
// ---------------------------------------------------------------------
// If the routing engine cannot be reached, or returns no route (e.g. a
// stop is in the ocean, or the two points are not connected by any
// known road), this returns `undefined`. The caller must present
// "Map route unavailable" and refuse to compute a map-derived distance
// or fuel efficiency from it -- never falling back to a straight line
// and quietly calling it the same thing.
//
// ---------------------------------------------------------------------
// LABELLING, EVERYWHERE THIS RESULT IS USED
// ---------------------------------------------------------------------
// The output of this service is ALWAYS "MAP-DERIVED". It is never to be
// relabelled, downstream, as GPS/actual/observed distance -- see
// distance-source-resolver.service.ts and shared/types/evidence.types.ts.

import { monitoring } from '@/infrastructure/monitoring/logger';

const OSRM_ENDPOINT = process.env.OSRM_ROUTING_ENDPOINT ?? 'https://router.project-osrm.org';
const REQUEST_TIMEOUT_MS = 6_000;

/** Minimum spacing between requests to the routing engine. A different host than Nominatim, so a separate, independently-sized gate. */
const MIN_ROUTING_INTERVAL_MS = 400;

/** A route geometry is simplified down to at most this many points before being stored/returned, purely for drawing a line on a map -- not a precision claim. */
const MAX_GEOMETRY_POINTS = 300;

export interface RouteStopInput {
  sequence: number;
  lat: number;
  lng: number;
}

export interface RouteLegResult {
  fromSequence: number;
  toSequence: number;
  distanceKm: number;
}

export interface RouteDistanceResult {
  legs: RouteLegResult[];
  totalDistanceKm: number;
  /** [lng, lat] pairs, simplified. Present whenever OSRM returned geometry. */
  geometry?: [number, number][];
}

let gate: Promise<void> = Promise.resolve();
let lastRequestAt = 0;

function throttleRouting<T>(work: () => Promise<T>): Promise<T> {
  const scheduled = gate.then(async () => {
    const wait = Math.max(0, lastRequestAt + MIN_ROUTING_INTERVAL_MS - Date.now());
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastRequestAt = Date.now();
    return work();
  });
  gate = scheduled.then(() => undefined, () => undefined);
  return scheduled;
}

/**
 * Evenly samples a coordinate list down to `maxPoints`, always keeping
 * the FIRST and LAST point. Dropping the tail (a naive `slice`) would
 * render a route as ending somewhere other than its real destination --
 * the same lesson trip-playback-service's downsampling documents for
 * telemetry traces, applied here to a routing engine's geometry instead.
 */
export function simplifyGeometry(
  points: [number, number][],
  maxPoints: number = MAX_GEOMETRY_POINTS
): [number, number][] {
  if (points.length <= maxPoints) return points;
  if (maxPoints < 2) return [points[0], points[points.length - 1]];

  const step = (points.length - 1) / (maxPoints - 1);
  const out: [number, number][] = [];
  for (let i = 0; i < maxPoints; i++) {
    out.push(points[Math.round(i * step)]);
  }
  return out;
}

interface OsrmResponse {
  code: string;
  routes?: Array<{
    distance: number; // meters, for the WHOLE route
    geometry?: { coordinates: [number, number][] };
    legs?: Array<{ distance: number }>; // meters, one per consecutive stop pair
  }>;
}

export class RouteDistanceService {
  /**
   * Computes the map-derived route over an ORDERED list of >= 2 stops.
   * Returns `undefined` on any failure to obtain a route -- never a
   * straight-line substitute (see header).
   */
  async computeRoute(stops: RouteStopInput[]): Promise<RouteDistanceResult | undefined> {
    if (stops.length < 2) return undefined;

    const coordinates = stops.map((s) => `${s.lng},${s.lat}`).join(';');
    const url = new URL(`${OSRM_ENDPOINT}/route/v1/driving/${coordinates}`);
    url.searchParams.set('overview', 'full');
    url.searchParams.set('geometries', 'geojson');
    url.searchParams.set('steps', 'false');

    try {
      return await throttleRouting(async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

        try {
          const response = await fetch(url.toString(), {
            method: 'GET',
            headers: { Accept: 'application/json' },
            signal: controller.signal,
          });

          if (!response.ok) {
            monitoring.logWarn('[RouteDistanceService] Routing engine returned an error status', {
              statusCode: response.status,
            });
            return undefined;
          }

          const body = (await response.json()) as OsrmResponse;
          if (body.code !== 'Ok' || !body.routes || body.routes.length === 0) {
            // A confirmed "no route between these points" -- e.g. a
            // stop with no known road, or two points on unconnected
            // networks. Not a transport failure, but still not a
            // distance we can report.
            monitoring.logWarn('[RouteDistanceService] No route found between the given stops', {
              code: body.code,
            });
            return undefined;
          }

          const route = body.routes[0];
          const legsMeters = route.legs ?? [];

          if (legsMeters.length !== stops.length - 1) {
            // Defensive: OSRM is expected to return one leg per
            // consecutive stop pair. A mismatch means the response
            // cannot be safely attributed to the stops the caller
            // asked about, so refuse rather than mis-assign distances
            // to the wrong leg.
            monitoring.logWarn('[RouteDistanceService] Leg count did not match stop count', {
              legCount: legsMeters.length,
              expected: stops.length - 1,
            });
            return undefined;
          }

          const legs: RouteLegResult[] = legsMeters.map((leg, i) => ({
            fromSequence: stops[i].sequence,
            toSequence: stops[i + 1].sequence,
            distanceKm: Math.round((leg.distance / 1000) * 1000) / 1000,
          }));

          const totalDistanceKm = Math.round((route.distance / 1000) * 1000) / 1000;

          const geometry = route.geometry?.coordinates
            ? simplifyGeometry(route.geometry.coordinates)
            : undefined;

          return { legs, totalDistanceKm, ...(geometry ? { geometry } : {}) };
        } finally {
          clearTimeout(timeout);
        }
      });
    } catch (error) {
      monitoring.logWarn('[RouteDistanceService] Lookup failed', {
        error: (error as Error).message,
      });
      return undefined;
    }
  }
}

export const routeDistanceService = new RouteDistanceService();
