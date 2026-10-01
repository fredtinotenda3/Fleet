// modules/telematics/services/geocoding-search.service.ts
//
// "Type a place name, get candidate locations with coordinates" -- the
// forward half of geocoding, powering the map-assisted trip log's
// location search (PART 3, items 1-3: "Type/search for a location.
// Select a geocoded result. Store latitude/longitude.").
//
// Sibling of reverse-geocode.service.ts (coordinate -> address); shares
// its provider (Nominatim, no key, no billing), its throttle (now
// extracted to nominatim-rate-limiter.ts precisely so these two callers
// cannot together exceed the policy's rate), and its philosophy:
// failure is an answer (an empty result list), never a guess, and never
// an exception that breaks the trip form around it.
//
// ---------------------------------------------------------------------
// WHY SEARCH RESULTS ARE CACHED BY QUERY TEXT, NOT BY CELL
// ---------------------------------------------------------------------
// Reverse geocoding caches by a coordinate grid cell because the input
// is already a coordinate. Here the input is free text an operator
// typed -- "Mt Pleasant", "mt pleasant harare" -- so the cache key is the
// NORMALIZED query string (see geocode-search-cache.repository.ts). Two
// different spellings of the same place are two different cache entries
// and two different upstream calls; that is an acceptable cost against
// Nominatim's own query-normalization already happening server-side, and
// building a fuzzy-match layer on top would be solving a problem this
// feature does not have evidence of yet.
//
// ---------------------------------------------------------------------
// PRIVACY
// ---------------------------------------------------------------------
// The query text itself (not a vehicle, driver or tenant identifier)
// goes to Nominatim -- identical disclosure boundary to the reverse
// service. An operator typing "Head Office Depot" discloses that string
// to OSM's public instance; this is unavoidable for any free-text
// geocoder and is the same trade-off this codebase already made for
// reverse lookups.

import { monitoring } from '@/infrastructure/monitoring/logger';
import {
  geocodeSearchCacheRepository,
  normalizeSearchQuery,
  type GeocodeSearchCandidate,
} from '../repositories/geocode-search-cache.repository';
import { throttleNominatim, nominatimUserAgent } from './nominatim-rate-limiter';

const PROVIDER = 'nominatim';
const NOMINATIM_SEARCH_ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const REQUEST_TIMEOUT_MS = 3_000;
const MAX_RESULTS = 6;
const MIN_QUERY_LENGTH = 2;

export interface GeocodeSearchResult {
  candidates: GeocodeSearchCandidate[];
  cached: boolean;
}

function isEnabled(): boolean {
  return (process.env.TELEMATICS_REVERSE_GEOCODE ?? 'on').toLowerCase() !== 'off';
}

interface NominatimSearchRow {
  display_name?: string;
  lat?: string;
  lon?: string;
  address?: Record<string, unknown>;
}

function toCandidate(row: NominatimSearchRow): GeocodeSearchCandidate | null {
  const lat = Number(row.lat);
  const lng = Number(row.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (!row.display_name) return null;
  // Nominatim's display_name is a full postal string -- useful here
  // (unlike the reverse panel) because the operator is CHOOSING between
  // several candidates and needs to disambiguate them, e.g. two
  // "Greendale" results in different towns.
  return { label: row.display_name, lat, lng };
}

export class GeocodingSearchService {
  /**
   * Resolves free text to candidate locations. Never throws -- returns
   * an empty candidate list on any failure (disabled, too short,
   * provider unreachable, provider error), so the trip-log search box
   * degrades to "no results" rather than breaking the form.
   */
  async search(query: string, tenantId: string): Promise<GeocodeSearchResult> {
    const trimmed = query.trim();
    if (!isEnabled() || trimmed.length < MIN_QUERY_LENGTH) {
      return { candidates: [], cached: false };
    }

    const normalizedQuery = normalizeSearchQuery(trimmed);

    try {
      const cached = await geocodeSearchCacheRepository.get(tenantId, normalizedQuery);
      if (cached) {
        return { candidates: cached.candidates, cached: true };
      }
    } catch (error) {
      monitoring.logWarn('[GeocodingSearchService] Cache read failed', {
        error: (error as Error).message,
      });
    }

    const candidates = await this.fetchFromNominatim(trimmed);
    if (candidates === undefined) {
      // Transient: could not reach the provider. NOT cached -- an
      // outage must not become a permanent "no results" for this query.
      return { candidates: [], cached: false };
    }

    try {
      await geocodeSearchCacheRepository.put({
        tenantId,
        normalizedQuery,
        candidates,
        provider: PROVIDER,
        resolvedAt: new Date(),
      });
    } catch (error) {
      monitoring.logWarn('[GeocodingSearchService] Cache write failed', {
        error: (error as Error).message,
      });
    }

    return { candidates, cached: false };
  }

  private async fetchFromNominatim(query: string): Promise<GeocodeSearchCandidate[] | undefined> {
    const url = new URL(NOMINATIM_SEARCH_ENDPOINT);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('q', query);
    url.searchParams.set('limit', String(MAX_RESULTS));
    url.searchParams.set('addressdetails', '0');

    try {
      return await throttleNominatim(async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

        try {
          const response = await fetch(url.toString(), {
            method: 'GET',
            headers: {
              Accept: 'application/json',
              'User-Agent': nominatimUserAgent(),
            },
            signal: controller.signal,
          });

          if (!response.ok) {
            monitoring.logWarn('[GeocodingSearchService] Provider returned an error status', {
              provider: PROVIDER,
              statusCode: response.status,
            });
            return undefined;
          }

          const body = (await response.json()) as NominatimSearchRow[] | { error?: unknown };
          if (!Array.isArray(body)) {
            // Nominatim reports "no result" as an error envelope on a
            // 200 for /search too -- a confirmed empty answer, not a
            // transport failure, so it IS cached (as an empty list).
            return [];
          }

          return body
            .map(toCandidate)
            .filter((c): c is GeocodeSearchCandidate => c !== null)
            .slice(0, MAX_RESULTS);
        } finally {
          clearTimeout(timeout);
        }
      });
    } catch (error) {
      monitoring.logWarn('[GeocodingSearchService] Lookup failed', {
        provider: PROVIDER,
        error: (error as Error).message,
      });
      return undefined;
    }
  }
}

export const geocodingSearchService = new GeocodingSearchService();
