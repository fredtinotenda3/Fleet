// tests/unit/telematics/route-distance.service.spec.ts
//
// PART 3/4 -- the map-derived route distance service. The property that
// matters most here is the one the file's own header insists on: ANY
// failure (bad status, no route, mismatched legs, a thrown network
// error) returns `undefined`, never a haversine or otherwise
// approximated substitute silently relabelled as a route.

import {
  RouteDistanceService,
  simplifyGeometry,
} from '@/modules/telematics/services/route-distance.service';

jest.mock('@/infrastructure/monitoring/logger', () => ({
  monitoring: { logWarn: jest.fn(), logError: jest.fn(), logInfo: jest.fn() },
}));

function mockFetchOnce(responder: () => { ok?: boolean; status?: number; json: () => unknown }) {
  const fn = jest.fn(async () => {
    const { ok = true, status = 200, json } = responder();
    return { ok, status, json: async () => json() } as unknown as Response;
  });
  (global as unknown as { fetch: unknown }).fetch = fn;
  return fn;
}

const originalFetch = global.fetch;
afterEach(() => {
  (global as unknown as { fetch: unknown }).fetch = originalFetch;
  jest.restoreAllMocks();
});

describe('simplifyGeometry', () => {
  it('returns the input unchanged when already within the cap', () => {
    const points: [number, number][] = [[0, 0], [1, 1], [2, 2]];
    expect(simplifyGeometry(points, 10)).toEqual(points);
  });

  it('always keeps the first and last point when downsampling', () => {
    const points: [number, number][] = Array.from({ length: 1000 }, (_, i) => [i, i] as [number, number]);
    const out = simplifyGeometry(points, 50);
    expect(out.length).toBe(50);
    expect(out[0]).toEqual(points[0]);
    expect(out[out.length - 1]).toEqual(points[points.length - 1]);
  });

  it('degenerates to exactly first+last when maxPoints < 2', () => {
    const points: [number, number][] = [[0, 0], [1, 1], [2, 2], [3, 3]];
    expect(simplifyGeometry(points, 1)).toEqual([points[0], points[3]]);
  });
});

describe('RouteDistanceService.computeRoute', () => {
  const stops = [
    { sequence: 0, lat: -17.82, lng: 31.05 },
    { sequence: 1, lat: -17.78, lng: 31.08 },
  ];

  it('returns undefined without calling the network when fewer than 2 stops are given', async () => {
    const fetchSpy = jest.fn();
    (global as unknown as { fetch: unknown }).fetch = fetchSpy;
    const service = new RouteDistanceService();

    const result = await service.computeRoute([stops[0]]);

    expect(result).toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns legs, total distance, and simplified geometry on a successful OSRM response', async () => {
    mockFetchOnce(() => ({
      json: () => ({
        code: 'Ok',
        routes: [
          {
            distance: 12345, // meters
            legs: [{ distance: 12345 }],
            geometry: { coordinates: [[31.05, -17.82], [31.08, -17.78]] },
          },
        ],
      }),
    }));
    const service = new RouteDistanceService();

    const result = await service.computeRoute(stops);

    expect(result).toBeDefined();
    expect(result?.totalDistanceKm).toBeCloseTo(12.345, 3);
    expect(result?.legs).toEqual([{ fromSequence: 0, toSequence: 1, distanceKm: 12.345 }]);
    expect(result?.geometry).toEqual([[31.05, -17.82], [31.08, -17.78]]);
  });

  it('returns undefined (never a fallback distance) on a non-OK HTTP status', async () => {
    mockFetchOnce(() => ({ ok: false, status: 503, json: () => ({}) }));
    const service = new RouteDistanceService();

    expect(await service.computeRoute(stops)).toBeUndefined();
  });

  it('returns undefined when OSRM reports no route between the stops', async () => {
    mockFetchOnce(() => ({ json: () => ({ code: 'NoRoute', routes: [] }) }));
    const service = new RouteDistanceService();

    expect(await service.computeRoute(stops)).toBeUndefined();
  });

  it('returns undefined when the leg count does not match the stop count (defensive mis-attribution guard)', async () => {
    mockFetchOnce(() => ({
      json: () => ({
        code: 'Ok',
        routes: [{ distance: 1000, legs: [{ distance: 500 }, { distance: 500 }] }], // 2 legs for 2 stops -- should be 1
      }),
    }));
    const service = new RouteDistanceService();

    expect(await service.computeRoute(stops)).toBeUndefined();
  });

  it('returns undefined (never throws) when the network call itself fails', async () => {
    (global as unknown as { fetch: unknown }).fetch = jest.fn(async () => {
      throw new TypeError('fetch failed');
    });
    const service = new RouteDistanceService();

    await expect(service.computeRoute(stops)).resolves.toBeUndefined();
  });
});
