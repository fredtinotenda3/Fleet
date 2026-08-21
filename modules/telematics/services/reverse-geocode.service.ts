// modules/telematics/services/reverse-geocode.service.ts
//
// "Where is this vehicle" as a place name rather than a coordinate pair,
// for the live-map vehicle detail panel.
//
// ---------------------------------------------------------------------
// PROVIDER CHOICE
// ---------------------------------------------------------------------
// OpenStreetMap's Nominatim, over its public endpoint. No API key, no
// billing, no account -- the same basis on which this product already
// takes its map TILES from OSM (see LiveMapLeaflet's header). Google
// Maps and every other paid geocoder are explicitly out.
//
// Nominatim's usage policy is the binding constraint and it is strict:
// at most one request per second, a genuine identifying User-Agent, and
// results cached rather than re-requested. All three are implemented
// below. This is not politeness -- an operator whose deployment ignores
// them gets the deployment's IP blocked, and the failure then looks like
// "addresses stopped working" with no other symptom.
//
//   * ONE REQUEST PER SECOND, process-wide: a single promise chain
//     (`gate`) serialises every caller through a minimum interval. Not
//     per tenant -- the limit is per source IP, and a deployment serving
//     five tenants shares one.
//   * CACHED FIRST, always, on a coarse grid (see
//     GEOCODE_GRID_DECIMALS). A parked vehicle costs one upstream
//     request for its entire stay, not one per 10-second poll.
//   * IDENTIFYING User-Agent, from NOMINATIM_USER_AGENT when set. The
//     policy asks for something that identifies the application and
//     reaches a human.
//
// ---------------------------------------------------------------------
// FAILURE IS AN ANSWER, NOT AN EXCEPTION
// ---------------------------------------------------------------------
// Every failure path returns null and the panel renders "Address
// unavailable". It never guesses, never falls back to a nearby cell, and
// never lets a geocoder problem break the telemetry read it is attached
// to -- an operator looking at speed and fuel must not lose the whole
// panel because a third-party service is slow.
//
// The distinction that earns its keep: a CONFIRMED "no address here"
// (Nominatim answered, and there is nothing near this coordinate) is
// cached, because re-asking will get the same answer forever. A failure
// to REACH Nominatim is not cached, because it is transient and caching
// it would turn a thirty-second outage into a permanently blank field.
//
// ---------------------------------------------------------------------
// PRIVACY
// ---------------------------------------------------------------------
// Sending a coordinate to a third party is a disclosure. Two things
// bound it: only the SELECTED vehicle is ever geocoded (never the fleet,
// which would stream every vehicle's position to an external service on
// every poll), and only the coordinate goes -- no vehicle id, plate,
// driver, tenant or any other identifier. Nominatim learns that
// somebody looked up a point; it cannot learn whose it is.
//
// Deployments that cannot accept even that can set
// TELEMATICS_REVERSE_GEOCODE=off, and the feature degrades to the same
// "Address unavailable" as any other failure.

import { monitoring } from '@/infrastructure/monitoring/logger';
import { geocodeCacheRepository, geocodeCell } from '../repositories/geocode-cache.repository';

const PROVIDER = 'nominatim';
const NOMINATIM_ENDPOINT = 'https://nominatim.openstreetmap.org/reverse';

/**
 * Nominatim's stated minimum interval between requests from one source.
 * A little over a second, because the limit is enforced on arrival and
 * network jitter should not be what pushes a request over it.
 */
const MIN_REQUEST_INTERVAL_MS = 1_100;

/**
 * Short by design. This runs inside the vehicle-detail request, so the
 * ceiling on how long a geocoder can delay a telemetry panel is this
 * number. Better a fast "Address unavailable" than a panel that hangs.
 */
const REQUEST_TIMEOUT_MS = 2_500;

/**
 * `zoom=16` is Nominatim's street level -- the resolution that answers
 * "Suffolk Road, Harare" rather than a house number (too fine, and a
 * different answer every few metres) or a suburb (too coarse to be
 * useful for a vehicle).
 */
const ZOOM = 16;

export interface ResolvedAddress {
  /** Single-line address as displayed, e.g. "Suffolk Road, Harare". Null when none could be determined. */
  address: string | null;
  locality?: string;
  road?: string;
  /** True when this came from the cache -- surfaced in tests and useful when diagnosing rate-limit behaviour. */
  cached: boolean;
}

function isEnabled(): boolean {
  return (process.env.TELEMATICS_REVERSE_GEOCODE ?? 'on').toLowerCase() !== 'off';
}

function userAgent(): string {
  return (
    process.env.NOMINATIM_USER_AGENT ??
    'FleetPlatform/1.0 (self-hosted fleet management; set NOMINATIM_USER_AGENT to identify this deployment)'
  );
}

/**
 * Process-wide serialising gate.
 *
 * Each caller chains onto the previous one and waits out the remainder
 * of the minimum interval. A queue rather than a token bucket because
 * the guarantee Nominatim asks for is about SPACING, not average rate --
 * a bucket permits a burst, which is precisely what gets an IP blocked.
 *
 * Never rejects: a failure inside one caller must not poison the chain
 * for the next.
 */
let gate: Promise<void> = Promise.resolve();
let lastRequestAt = 0;

function throttle<T>(work: () => Promise<T>): Promise<T> {
  const scheduled = gate.then(async () => {
    const wait = Math.max(0, lastRequestAt + MIN_REQUEST_INTERVAL_MS - Date.now());
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastRequestAt = Date.now();
    return work();
  });

  gate = scheduled.then(
    () => undefined,
    () => undefined
  );
  return scheduled;
}

/**
 * Formats Nominatim's `address` object into one line.
 *
 * ONLY components the response actually carried are used, and the result
 * is null when none of them are present -- `display_name` is
 * deliberately not used as a fallback, because it is a full postal
 * string ("12, Suffolk Road, Belvedere, Harare, Harare Province, 00263,
 * Zimbabwe") that does not fit the field and buries the useful part.
 *
 * Road-then-locality is the order an operator reads: the street answers
 * "where exactly", the locality answers "which town". When there is no
 * road (open country), the locality alone is still a useful answer --
 * which is what "or similar locality if available" asks for.
 */
export function formatNominatimAddress(
  address: Record<string, unknown> | undefined
): { line: string | null; road?: string; locality?: string } {
  if (!address || typeof address !== 'object') return { line: null };

  const read = (key: string): string | undefined => {
    const value = address[key];
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  };

  const road = read('road') ?? read('pedestrian') ?? read('footway') ?? read('residential');
  const locality =
    read('city') ??
    read('town') ??
    read('village') ??
    read('suburb') ??
    read('municipality') ??
    read('county') ??
    read('state');

  const parts = [road, locality].filter(Boolean) as string[];
  return {
    line: parts.length > 0 ? parts.join(', ') : null,
    ...(road ? { road } : {}),
    ...(locality ? { locality } : {}),
  };
}

export class ReverseGeocodeService {
  /**
   * Nearest address for a coordinate, or null.
   *
   * Never throws. `tenantId` scopes the cache only -- it is not sent
   * upstream (see the privacy note in the header).
   */
  async resolve(lat: number, lng: number, tenantId: string): Promise<ResolvedAddress | null> {
    if (!isEnabled()) return null;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    // Same null-island rejection hasUsableFix applies: a device with no
    // lock is not sitting in the Gulf of Guinea, and geocoding it would
    // confidently report a place the vehicle has never been.
    if (lat === 0 && lng === 0) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

    const cell = geocodeCell(lat, lng);

    try {
      const cached = await geocodeCacheRepository.get(tenantId, cell);
      if (cached) {
        return {
          address: cached.address,
          ...(cached.locality ? { locality: cached.locality } : {}),
          ...(cached.road ? { road: cached.road } : {}),
          cached: true,
        };
      }
    } catch (error) {
      // A cache read failure must not stop the lookup -- fall through to
      // the network path rather than reporting the address as missing.
      monitoring.logWarn('[ReverseGeocodeService] Cache read failed', {
        error: (error as Error).message,
      });
    }

    const resolved = await this.fetchFromNominatim(lat, lng);
    if (resolved === undefined) {
      // Transient: could not reach the provider. NOT cached -- see the
      // header. The caller renders "Address unavailable" this time and
      // tries again on the next poll.
      return null;
    }

    try {
      await geocodeCacheRepository.put({
        tenantId,
        cell,
        address: resolved.line,
        ...(resolved.locality ? { locality: resolved.locality } : {}),
        ...(resolved.road ? { road: resolved.road } : {}),
        provider: PROVIDER,
        resolvedAt: new Date(),
      });
    } catch (error) {
      monitoring.logWarn('[ReverseGeocodeService] Cache write failed', {
        error: (error as Error).message,
      });
    }

    return {
      address: resolved.line,
      ...(resolved.locality ? { locality: resolved.locality } : {}),
      ...(resolved.road ? { road: resolved.road } : {}),
      cached: false,
    };
  }

  /**
   * One upstream lookup.
   *
   * Returns the formatted result on success (including a confirmed
   * "nothing here", as `line: null`), or `undefined` when the provider
   * could not be reached at all. That three-way return is what lets the
   * caller cache the first and not the second -- a boolean or a bare
   * null would collapse "there is no road here" into "the network is
   * down" and cache an outage forever.
   */
  private async fetchFromNominatim(
    lat: number,
    lng: number
  ): Promise<{ line: string | null; road?: string; locality?: string } | undefined> {
    const url = new URL(NOMINATIM_ENDPOINT);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('lat', String(lat));
    url.searchParams.set('lon', String(lng));
    url.searchParams.set('zoom', String(ZOOM));
    url.searchParams.set('addressdetails', '1');

    try {
      return await throttle(async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

        try {
          const response = await fetch(url.toString(), {
            method: 'GET',
            headers: {
              Accept: 'application/json',
              'User-Agent': userAgent(),
            },
            signal: controller.signal,
          });

          if (!response.ok) {
            // A 4xx here is usually the rate limiter or a blocked
            // User-Agent, both of which are operational problems worth
            // seeing in logs rather than silently absorbing.
            monitoring.logWarn('[ReverseGeocodeService] Provider returned an error status', {
              provider: PROVIDER,
              statusCode: response.status,
            });
            return undefined;
          }

          const body = (await response.json()) as { address?: Record<string, unknown>; error?: unknown };
          // Nominatim reports "no result" as an `error` member on a 200,
          // the same envelope-inside-a-success shape Eagle Track uses.
          // That IS a confirmed answer about this coordinate, so it is
          // cached as such rather than treated as a transport failure.
          if (body?.error) return { line: null };

          return formatNominatimAddress(body?.address);
        } finally {
          clearTimeout(timeout);
        }
      });
    } catch (error) {
      // Timeout, DNS, TLS, abort. Transient by assumption -- never
      // cached. The coordinate is NOT interpolated into the log line:
      // a vehicle position in a log is the movement data this module's
      // scoping rules exist to protect.
      monitoring.logWarn('[ReverseGeocodeService] Lookup failed', {
        provider: PROVIDER,
        error: (error as Error).message,
      });
      return undefined;
    }
  }
}

export const reverseGeocodeService = new ReverseGeocodeService();
