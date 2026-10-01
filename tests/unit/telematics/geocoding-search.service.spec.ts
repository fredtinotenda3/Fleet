// tests/unit/telematics/geocoding-search.service.spec.ts
//
// PART 3 -- the map-assisted trip log's forward-geocode search. The
// properties under test mirror reverse-geocode.spec.ts's own framing:
// never throw, never cache a transient failure, and do cache a
// confirmed empty result (Nominatim's own "no result" envelope).

import { geocodingSearchService } from '@/modules/telematics/services/geocoding-search.service';
import { geocodeSearchCacheRepository } from '@/modules/telematics/repositories/geocode-search-cache.repository';

jest.mock('@/infrastructure/monitoring/logger', () => ({
  monitoring: { logWarn: jest.fn(), logError: jest.fn(), logInfo: jest.fn() },
}));

// Bypasses the real ~1.1s Nominatim spacing gate for this test file --
// the throttle's own correctness (one shared gate for both Nominatim
// callers) is covered by it governing both services identically, not by
// timing it out here.
jest.mock('@/modules/telematics/services/nominatim-rate-limiter', () => ({
  throttleNominatim: (work: () => Promise<unknown>) => work(),
  nominatimUserAgent: () => 'test-agent',
}));

jest.mock('@/modules/telematics/repositories/geocode-search-cache.repository', () => {
  const actual = jest.requireActual('@/modules/telematics/repositories/geocode-search-cache.repository');
  return {
    ...actual,
    geocodeSearchCacheRepository: { get: jest.fn(), put: jest.fn() },
  };
});

const mockedCache = geocodeSearchCacheRepository as jest.Mocked<typeof geocodeSearchCacheRepository>;

function mockFetchOnce(responder: () => { ok?: boolean; status?: number; json: () => unknown }) {
  const fn = jest.fn(async () => {
    const { ok = true, status = 200, json } = responder();
    return { ok, status, json: async () => json() } as unknown as Response;
  });
  (global as unknown as { fetch: unknown }).fetch = fn;
  return fn;
}

const originalFetch = global.fetch;
beforeEach(() => {
  jest.clearAllMocks();
  mockedCache.get.mockResolvedValue(null);
  mockedCache.put.mockResolvedValue(undefined);
});
afterEach(() => {
  (global as unknown as { fetch: unknown }).fetch = originalFetch;
});

describe('GeocodingSearchService.search', () => {
  it('never calls the network for a query shorter than the minimum length', async () => {
    const fetchSpy = jest.fn();
    (global as unknown as { fetch: unknown }).fetch = fetchSpy;

    const result = await geocodingSearchService.search('a', 'tenant-1');

    expect(result).toEqual({ candidates: [], cached: false });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns a cached result without touching the network', async () => {
    mockedCache.get.mockResolvedValue({
      tenantId: 'tenant-1',
      normalizedQuery: 'mt pleasant',
      candidates: [{ label: 'Mt Pleasant, Harare', lat: -17.79, lng: 31.03 }],
      provider: 'nominatim',
      resolvedAt: new Date(),
    });
    const fetchSpy = jest.fn();
    (global as unknown as { fetch: unknown }).fetch = fetchSpy;

    const result = await geocodingSearchService.search('Mt Pleasant', 'tenant-1');

    expect(result.cached).toBe(true);
    expect(result.candidates).toEqual([{ label: 'Mt Pleasant, Harare', lat: -17.79, lng: 31.03 }]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('maps a successful Nominatim response to candidates and caches it', async () => {
    mockFetchOnce(() => ({
      json: () => [
        { display_name: 'Mt Pleasant, Harare, Zimbabwe', lat: '-17.79', lon: '31.03' },
        { display_name: 'Mt Pleasant Shops, Harare', lat: '-17.80', lon: '31.04' },
      ],
    }));

    const result = await geocodingSearchService.search('mt pleasant', 'tenant-1');

    expect(result.cached).toBe(false);
    expect(result.candidates).toEqual([
      { label: 'Mt Pleasant, Harare, Zimbabwe', lat: -17.79, lng: 31.03 },
      { label: 'Mt Pleasant Shops, Harare', lat: -17.8, lng: 31.04 },
    ]);
    expect(mockedCache.put).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-1', normalizedQuery: 'mt pleasant' })
    );
  });

  it('caches a confirmed empty result (Nominatim\'s own "no result" envelope)', async () => {
    mockFetchOnce(() => ({ json: () => ({ error: 'Unable to geocode' }) }));

    const result = await geocodingSearchService.search('asdkjasdkj', 'tenant-1');

    expect(result).toEqual({ candidates: [], cached: false });
    expect(mockedCache.put).toHaveBeenCalledWith(
      expect.objectContaining({ candidates: [] })
    );
  });

  it('does NOT cache a transient provider failure', async () => {
    mockFetchOnce(() => ({ ok: false, status: 503, json: () => ({}) }));

    const result = await geocodingSearchService.search('transient failure query', 'tenant-1');

    expect(result).toEqual({ candidates: [], cached: false });
    expect(mockedCache.put).not.toHaveBeenCalled();
  });

  it('never throws when the network call itself fails', async () => {
    (global as unknown as { fetch: unknown }).fetch = jest.fn(async () => {
      throw new TypeError('fetch failed');
    });

    await expect(geocodingSearchService.search('network down query', 'tenant-1')).resolves.toEqual({
      candidates: [],
      cached: false,
    });
    expect(mockedCache.put).not.toHaveBeenCalled();
  });

  it('drops a candidate row with non-numeric coordinates rather than passing through a NaN', async () => {
    mockFetchOnce(() => ({
      json: () => [
        { display_name: 'Good Row', lat: '-17.79', lon: '31.03' },
        { display_name: 'Bad Row', lat: 'not-a-number', lon: '31.03' },
      ],
    }));

    const result = await geocodingSearchService.search('mixed validity query', 'tenant-1');

    expect(result.candidates).toEqual([{ label: 'Good Row', lat: -17.79, lng: 31.03 }]);
  });
});
