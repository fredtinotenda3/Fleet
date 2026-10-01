// modules/telematics/services/nominatim-rate-limiter.ts
//
// ONE process-wide rate gate for every call this deployment makes to
// OpenStreetMap's Nominatim, regardless of which endpoint.
//
// ---------------------------------------------------------------------
// WHY THIS WAS EXTRACTED
// ---------------------------------------------------------------------
// reverse-geocode.service.ts (vehicle position -> address) originally
// defined its own private `gate`/`lastRequestAt` pair. The Operational-
// Connectivity upgrade adds a SECOND Nominatim caller --
// geocoding-search.service.ts (address text -> candidate locations, for
// the map-assisted trip log). Nominatim's usage policy limits requests
// per SOURCE IP across the WHOLE service, not per endpoint -- two
// independent throttles, each individually correct, would together let
// this deployment send up to 2 requests/second, silently doubling the
// rate the policy asks for and risking exactly the IP block
// reverse-geocode.service.ts's own header warns about.
//
// One shared gate, used by both callers, is the only way two features
// can each be "locally correct" and still be correct together.
//
// ---------------------------------------------------------------------
// CONTRACT
// ---------------------------------------------------------------------
// `throttleNominatim(work)` queues `work` behind every previously
// queued call from EITHER caller, waiting out whatever remains of
// MIN_REQUEST_INTERVAL_MS since the last request actually went out, to
// either endpoint. A queue (not a token bucket) because the policy is
// about SPACING, not an average rate a bucket would let burst.
//
// Never rejects: a failure inside one caller's `work` must not poison
// the chain for the next caller (from either feature).

/**
 * Nominatim's stated minimum interval between requests from one source.
 * A little over a second, because the limit is enforced on arrival and
 * network jitter should not be what pushes a request over it. Matches
 * the value reverse-geocode.service.ts used before extraction.
 */
export const MIN_NOMINATIM_INTERVAL_MS = 1_100;

let gate: Promise<void> = Promise.resolve();
let lastRequestAt = 0;

export function throttleNominatim<T>(work: () => Promise<T>): Promise<T> {
  const scheduled = gate.then(async () => {
    const wait = Math.max(0, lastRequestAt + MIN_NOMINATIM_INTERVAL_MS - Date.now());
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

/** Shared identifying User-Agent, same env var both Nominatim callers honour. */
export function nominatimUserAgent(): string {
  return (
    process.env.NOMINATIM_USER_AGENT ??
    'FleetPlatform/1.0 (self-hosted fleet management; set NOMINATIM_USER_AGENT to identify this deployment)'
  );
}
