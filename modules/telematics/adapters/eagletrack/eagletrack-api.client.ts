// modules/telematics/adapters/eagletrack/eagletrack-api.client.ts
//
// Thin HTTP client for Eagle Track's api2 platform. Like
// cartrack-api.client.ts it has no knowledge of tenants, vehicles, or
// our data model -- it authenticates, fetches, and normalises the wire
// format. eagletrack.adapter.ts is the layer that maps this onto our
// TelematicsData ingest pipeline.
//
// FOUR THINGS THIS CLIENT DOES THAT CARTRACK'S DOES NOT:
//
//  1. TOKEN IN THE QUERY STRING, BECAUSE THE PLATFORM ACCEPTS NOTHING
//     ELSE. This file previously sent the token as a `token` HTTP header
//     on the reasoning that a credential in a URL is copied into access
//     logs, proxy logs and referrers. That reasoning is still correct --
//     but production testing against a live deployment established that
//     the header form is not authenticated at all: api2 treats a
//     header-only request as anonymous and redirects it to its HTML
//     login page, answering HTTP 200 with `Content-Type: text/html`.
//     Only `?token=...` authenticates.
//
//     So the query form is now the ONLY form used, and the leak surface
//     it opens is closed deliberately rather than accepted:
//
//       * the token is never logged and never interpolated into an error
//         message -- log and error sites carry `endpoint` (origin +
//         path, no query string) instead of a URL;
//       * every string that could have come back from the vendor and
//         echoed our own request (an error body, a login page) is passed
//         through redactToken() before it is attached to anything;
//       * nothing in this file hands url.toString() to a logger, and
//         tests/security/telematics-eagletrack-token-leak.spec.ts fails
//         the build if that changes.
//
//     What we cannot close is the VENDOR's own logging: their nginx
//     writes the full request line, token included, to its access log.
//     That is a property of their API design, not of this client, and it
//     is why the token must be treated as rotatable and rotated if a
//     deployment's logs are ever exposed. Recorded in the changelog
//     under known limitations.
//
//  2. ENVELOPE ERRORS. api2 answers HTTP 200 with `{"error": <code>}`
//     on failure. Checking `response.ok` alone would treat a rejected
//     token as a successful empty sync -- the worst possible failure
//     mode, because it looks like "this tenant has no vehicles".
//
//  3. NON-JSON BODIES ON HTTP 200, and a Content-Type that cannot be
//     trusted either way. The live deployment returns its JSON envelope
//     labelled `text/html; charset=UTF-8`, and returns an actual HTML
//     login page -- also `text/html`, also HTTP 200 -- when a request is
//     not authenticated. Content-Type therefore distinguishes nothing,
//     so this client ignores it, parses the body itself, and classifies
//     a parse failure as a credentials verdict rather than letting it
//     surface as an unhandled TypeError out of response.json().
//
//  4. OBJECT-KEYED PAYLOAD. `GET /api2/last` returns `data` as an object
//     keyed by uin. getLastForAll flattens it into an array using the
//     key as the authoritative tracker id.

import { monitoring } from '@/infrastructure/monitoring/logger';
import {
  EagleTrackLastResponse,
  EagleTrackTracker,
  EagleTrackTrackerStatus,
  EagleTrackTrackersResponse,
} from './eagletrack.types';

/**
 * The query parameter api2 authenticates on. Named here rather than
 * inlined so the "a caller-supplied param can never collide with it"
 * guard in buildUrl, and the test that proves it, refer to one constant.
 */
export const EAGLETRACK_TOKEN_QUERY_PARAM = 'token';

/** What redactToken substitutes for the credential. Deliberately not token-shaped. */
export const EAGLETRACK_TOKEN_REDACTION = '[redacted]';

/** Cap on any vendor-supplied text we retain for diagnosis. An HTML login page is not a useful log entry. */
const MAX_RETAINED_BODY_CHARS = 200;

export class EagleTrackApiError extends Error {
  constructor(
    message: string,
    /** HTTP status, when the failure was at the transport level. */
    public readonly statusCode?: number,
    /** The envelope's `error` code, when the vendor reported failure in the body of an HTTP 200. */
    public readonly vendorErrorCode?: number,
    public readonly cause?: unknown,
    /**
     * True when the platform answered with a body that is not JSON at
     * all -- in practice its HTML login page, which api2 serves (as an
     * HTTP 200) to any request it does not consider authenticated.
     */
    public readonly nonJsonBody?: boolean
  ) {
    super(message);
    this.name = 'EagleTrackApiError';
  }

  /**
   * True when the vendor answered coherently and rejected us -- i.e. a
   * credentials/permission verdict rather than a transport problem.
   * Used by verifyCredentials to distinguish "your token is wrong" from
   * "the platform is down", which must not be reported the same way.
   *
   * `nonJsonBody` and a 3xx both count as rejections because that is
   * literally how this platform says "not authenticated": it redirects
   * to, or renders, its login page. Before that classification existed,
   * a genuinely invalid token made verifyCredentials RETHROW -- so
   * "Test connection" reported a platform outage for the one condition
   * it exists to detect.
   *
   * The trade-off, stated because it is real: an HTML error page emitted
   * by something in front of the API (a captive portal, a proxy) with a
   * 2xx status will also be reported as bad credentials. Anything that
   * fails with a normal 5xx still classifies correctly, and the error
   * message names the condition observed, so the misdiagnosis is
   * recoverable. The reverse default -- reporting a rejected token as an
   * outage -- sends the operator to debug a healthy network instead of
   * rotating a dead credential.
   */
  get isVendorRejection(): boolean {
    if (this.vendorErrorCode !== undefined) return true;
    if (this.nonJsonBody === true) return true;
    if (this.statusCode === 401 || this.statusCode === 403) return true;
    if (this.statusCode !== undefined && this.statusCode >= 300 && this.statusCode < 400) return true;
    return false;
  }
}

/**
 * `uin` selector for the fleet-wide poll, as vendor-documented.
 *
 * The vendor documents four selectors: a single tracker id,
 * `__group<id>`, `__all_sub` (every tracker belonging to the token's
 * user and its sub-users) and `__all_sys_` (every tracker on the whole
 * deployment). `__all_sys_` was never used: on a reseller-run instance
 * that would pull other customers' vehicles into this tenant's sync,
 * precisely the cross-tenant leak class this codebase has spent several
 * phases eliminating.
 *
 * `__all_sub` is NOT used either, despite being documented as
 * least-privilege: production testing against a live deployment
 * established that this selector is REJECTED outright --
 * `GET /api2/last?uin=__all_sub&token=...` answers HTTP 200 with the
 * literal body `Access Denied:__all_sub`, not the JSON envelope this
 * client expects (that response is classified the same way any other
 * non-JSON body is -- see request()'s nonJsonBody handling). The
 * selector that DOES work on that deployment, and is used instead, is
 * `?user=<account username>` -- see EAGLETRACK_USER_QUERY_PARAM and
 * getLastForAll.
 *
 * Kept here, unused by this client, only because it is still what the
 * vendor's own documentation names for a fleet-wide pull and a future
 * reader comparing the two needs to see why it was abandoned.
 */
export const EAGLETRACK_FLEET_SELECTOR = '__all_sub';

/**
 * The query parameter the live-status poll authenticates against
 * instead of `uin=__all_sub` (see EAGLETRACK_FLEET_SELECTOR). Its value
 * is the vendor account's username, e.g. "Willsgrove" -- NOT a
 * per-tenant constant. eagletrack.adapter.ts derives it fresh from each
 * sync's own `GET /api2/trackers` response and passes it in; nothing in
 * this client hardcodes a tenant's username.
 */
export const EAGLETRACK_USER_QUERY_PARAM = 'user';

export interface EagleTrackApiClientConfig {
  /** Base URL of the tenant's deployment. Path suffixes and trailing slashes are normalised away. */
  domain: string;
  /** Static API token from the vendor UI (Settings -> API Tokens). Sent as the `token` query parameter. */
  token: string;
  /** Request timeout in ms. Defaults to 15s so a hanging vendor response can't stall a sync job. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 15_000;
/** Credential probes must not be able to stall the settings UI for the full sync timeout. */
const VERIFY_TIMEOUT_MS = 8_000;

/**
 * Normalises whatever an administrator typed into the settings form into
 * an origin we can safely append `/api2/...` to.
 *
 * Operators paste the URL they use in a browser, which is very often
 * `https://gps.example.com/api2` or `.../api2/`. Appending our own
 * `/api2/last` to that yields `/api2/api2/last` and a 404 that looks
 * like "the integration is broken" rather than "the URL has an extra
 * segment". Stripping it here is cheaper than a support ticket.
 */
export function normaliseEagleTrackBaseUrl(domain: string): string {
  return domain.trim().replace(/\/+$/, '').replace(/\/api2$/i, '');
}

/**
 * Extracts a short, safe machine code from a transport failure.
 *
 * Node's fetch reports almost everything as `TypeError: fetch failed`
 * with the useful detail on `.cause`, and that detail can contain a
 * hostname or a whole URL. Rather than pass any of it through, only an
 * ALL-CAPS errno-style code (`ENOTFOUND`, `ECONNREFUSED`,
 * `CERT_HAS_EXPIRED`) is accepted, and only up to a sane length.
 * Anything else yields undefined and the message stays generic -- a
 * diagnosable code is worth having, an unbounded vendor string is not.
 */
function transportErrorCode(error: unknown): string | undefined {
  const direct = (error as { code?: unknown })?.code;
  const nested = (error as { cause?: { code?: unknown } })?.cause?.code;
  const candidate = typeof direct === 'string' ? direct : typeof nested === 'string' ? nested : undefined;
  if (!candidate) return undefined;
  return /^[A-Z][A-Z0-9_]{1,39}$/.test(candidate) ? candidate : undefined;
}

export class EagleTrackApiClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly timeoutMs: number;

  constructor(config: EagleTrackApiClientConfig) {
    this.baseUrl = normaliseEagleTrackBaseUrl(config.domain);
    this.token = config.token;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /**
   * Current snapshot for every tracker on the account -- the fleet-wide
   * poll, playing the same role Cartrack's GET /vehicles/status plays.
   *
   * The vendor returns `data` keyed by uin; this flattens to an array
   * and stamps each entry's `uin` from the KEY rather than trusting the
   * (duplicated) field inside the entry, so a vendor-side inconsistency
   * between the two can't quietly re-attribute a fix to another vehicle.
   *
   * `username` selects the account (`?user=<username>`) -- see
   * EAGLETRACK_USER_QUERY_PARAM for why this replaced the documented
   * `uin=__all_sub` selector, and eagletrack.adapter.ts for where the
   * caller derives it. Required, not defaulted: there is no tenant-wide
   * value that is safe to guess here.
   */
  async getLastForAll(username: string): Promise<EagleTrackTrackerStatus[]> {
    const envelope = await this.request<EagleTrackLastResponse>('/api2/last', {
      [EAGLETRACK_USER_QUERY_PARAM]: username,
    });

    return flattenLastPayload(envelope.data);
  }

  /**
   * The tracker roster -- uin, name, owner, and whatever plate-bearing
   * fields the deployment populates. See eagletrack.adapter.ts for which
   * of those are used for vehicle matching, and in what order.
   *
   * Delegates to getTrackersWithRefData and discards `refData`, for
   * callers that only need the roster itself.
   */
  async getTrackers(): Promise<EagleTrackTracker[]> {
    return (await this.getTrackersWithRefData()).trackers;
  }

  /**
   * The tracker roster, together with the response's `refData` section.
   *
   * `refData.users` is the fallback source eagletrack.adapter.ts uses to
   * derive the account username for getLastForAll, when no roster row
   * carries a usable `belong`. See EagleTrackRefData's doc comment.
   */
  async getTrackersWithRefData(): Promise<{ trackers: EagleTrackTracker[]; refData?: EagleTrackTrackersResponse['refData'] }> {
    const envelope = await this.request<EagleTrackTrackersResponse>('/api2/trackers');
    const data = envelope.data;
    const trackers = Array.isArray(data)
      ? data.filter((tracker): tracker is EagleTrackTracker => {
          return Boolean(tracker) && typeof tracker === 'object' && tracker.uin !== undefined && tracker.uin !== null;
        })
      : [];

    return { trackers, refData: envelope.refData };
  }

  /**
   * Verifies the stored token authenticates, without pulling a full
   * fleet payload. Backs the "test connection" action in settings.
   *
   * Returns false ONLY for a coherent vendor rejection -- an `error`
   * code in the envelope, an HTML login page instead of JSON, a
   * redirect, or HTTP 401/403. A timeout, DNS failure or 5xx is
   * rethrown: reporting "invalid credentials" when the platform is
   * simply unreachable sends the operator to rotate a token that was
   * never the problem.
   */
  async verifyCredentials(): Promise<boolean> {
    try {
      // pageSize=1 keeps the probe cheap where the deployment honours
      // pagination on object endpoints. The vendor documents pagination
      // for history/reports only, so a deployment that ignores it will
      // return the full roster -- still one request, and still far
      // cheaper than a fleet-wide `last` pull.
      await this.request<EagleTrackTrackersResponse>(
        '/api2/trackers',
        { pageSize: '1', pageIndex: '1' },
        VERIFY_TIMEOUT_MS
      );
      return true;
    } catch (error) {
      if (error instanceof EagleTrackApiError && error.isVendorRejection) return false;
      throw error;
    }
  }

  /**
   * Replaces every occurrence of the live token with a placeholder.
   *
   * Applied to anything that originated outside this process before it
   * is attached to an error or handed to a logger. The vendor echoing
   * our own request URL back inside an error body is exactly what turns
   * "the token is only in the URL" into "the token is in our logs", and
   * it is not hypothetical: PHP-era platforms print REQUEST_URI in
   * stack traces.
   *
   * split/join rather than a RegExp: the token is opaque vendor-issued
   * text and could contain regex metacharacters.
   */
  private redactToken(value: string): string {
    if (!this.token) return value;
    return value.split(this.token).join(EAGLETRACK_TOKEN_REDACTION);
  }

  /**
   * The identifier used in logs and error messages: origin + path, with
   * NO query string, so it can never carry the credential. This is what
   * "log the endpoint, not the URL" means in practice.
   */
  private describeEndpoint(path: string): string {
    return `${this.baseUrl}${path}`;
  }

  /**
   * Builds the request URL with the token appended as a query parameter.
   *
   * The token is set LAST, and a caller-supplied param of the same name
   * is skipped outright. Both are deliberate: `searchParams.set` would
   * otherwise let a `token` key in `params` replace the credential with
   * something else, and "the security-critical key is owned by this
   * layer, so this layer writes it last" is the same discipline
   * server/reporting's orgUnitPredicate uses against the same class of
   * bug. No caller does this today; the guard exists so none can start.
   */
  private buildUrl(path: string, params: Record<string, string>): URL {
    const url = new URL(this.describeEndpoint(path));

    for (const [key, value] of Object.entries(params)) {
      if (key === EAGLETRACK_TOKEN_QUERY_PARAM) continue;
      url.searchParams.set(key, value);
    }

    url.searchParams.set(EAGLETRACK_TOKEN_QUERY_PARAM, this.token);
    return url;
  }

  private async request<T extends { error: number | string; msg?: string }>(
    path: string,
    params: Record<string, string> = {},
    timeoutMs = this.timeoutMs
  ): Promise<T> {
    const endpoint = this.describeEndpoint(path);
    const url = this.buildUrl(path, params);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    // Endpoint and param NAMES only. Never url.toString(), and never the
    // param values -- `token` is one of them.
    monitoring.logDebug('[EagleTrackApiClient] Request', {
      endpoint,
      params: Object.keys(params),
    });

    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          // No `token` header: this platform does not authenticate on it
          // (see the file header). Accept is advisory only -- the
          // deployment labels its JSON as text/html regardless.
          Accept: 'application/json',
        },
        signal: controller.signal,
      });

      // Read the body ONCE, as text, and parse it here. Two reasons:
      // response.json() consumes the body so a fallback read is
      // impossible after it, and this deployment's Content-Type is not a
      // reliable indicator of what the body actually is (JSON labelled
      // text/html on success; a real HTML login page, also labelled
      // text/html, when unauthenticated).
      const rawBody = await response.text().catch(() => '');

      if (!response.ok) {
        monitoring.logWarn('[EagleTrackApiClient] Request failed', {
          endpoint,
          statusCode: response.status,
        });

        throw new EagleTrackApiError(
          `Eagle Track API request to ${endpoint} failed: ${response.status} ${response.statusText}`,
          response.status,
          undefined,
          this.retainForDiagnosis(rawBody)
        );
      }

      let parsed: T;
      try {
        parsed = JSON.parse(rawBody) as T;
      } catch {
        monitoring.logWarn('[EagleTrackApiClient] Non-JSON response', {
          endpoint,
          statusCode: response.status,
        });

        throw new EagleTrackApiError(
          `Eagle Track API returned a non-JSON response from ${endpoint} (HTTP ${response.status}). ` +
            'This platform serves its HTML login page, as an HTTP 200, to requests it does not consider ' +
            'authenticated -- check that the API token is valid and has not been revoked.',
          response.status,
          undefined,
          this.retainForDiagnosis(rawBody),
          true
        );
      }

      if (!parsed || typeof parsed !== 'object') {
        throw new EagleTrackApiError(
          `Eagle Track API returned a malformed response body from ${endpoint}`,
          response.status,
          undefined,
          undefined,
          true
        );
      }

      // The load-bearing check: api2 reports failure inside a 200.
      const vendorError = Number(parsed.error);
      if (Number.isFinite(vendorError) && vendorError !== 0) {
        const detail = typeof parsed.msg === 'string' ? this.redactToken(parsed.msg) : '';

        monitoring.logWarn('[EagleTrackApiClient] Vendor error envelope', {
          endpoint,
          statusCode: response.status,
          vendorErrorCode: vendorError,
        });

        throw new EagleTrackApiError(
          `Eagle Track API error ${vendorError}${detail ? `: ${detail}` : ''}`,
          response.status,
          vendorError
        );
      }

      return parsed;
    } catch (error) {
      if (error instanceof EagleTrackApiError) throw error;

      if ((error as { name?: string })?.name === 'AbortError') {
        throw new EagleTrackApiError(
          `Eagle Track API request to ${endpoint} timed out after ${timeoutMs}ms`,
          undefined,
          undefined,
          error
        );
      }

      // The underlying message is NOT interpolated: Node's fetch puts
      // hostnames and sometimes whole URLs in it. Only a vetted errno
      // code is carried through.
      const code = transportErrorCode(error);
      throw new EagleTrackApiError(
        `Eagle Track API request to ${endpoint} failed${code ? ` (${code})` : ''}`,
        undefined,
        undefined,
        error
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Truncated, token-redacted vendor text kept on the error's `cause`
   * for interactive debugging.
   *
   * Safe to retain because our logger records `message` and `stack` only
   * and never walks `cause` -- but it is redacted anyway, so that a
   * future logger change cannot turn this into a leak.
   */
  private retainForDiagnosis(body: string): string | undefined {
    if (!body) return undefined;
    const clipped = body.length > MAX_RETAINED_BODY_CHARS ? `${body.slice(0, MAX_RETAINED_BODY_CHARS)}...` : body;
    return this.redactToken(clipped);
  }
}

/**
 * Flattens the uin-keyed `last` payload into an array.
 *
 * Exported for direct unit testing, and tolerant of an array-shaped
 * `data` because the vendor's `history` endpoint (out of scope here, but
 * the obvious next extension point) returns one.
 */
export function flattenLastPayload(
  data: Record<string, EagleTrackTrackerStatus> | EagleTrackTrackerStatus[] | undefined | null
): EagleTrackTrackerStatus[] {
  if (!data) return [];

  if (Array.isArray(data)) {
    return data
      .filter((entry): entry is EagleTrackTrackerStatus => Boolean(entry) && typeof entry === 'object')
      .filter((entry) => entry.uin !== undefined && entry.uin !== null)
      .map((entry) => ({ ...entry, uin: String(entry.uin) }));
  }

  if (typeof data !== 'object') return [];

  return Object.entries(data)
    .filter(([, entry]) => Boolean(entry) && typeof entry === 'object')
    .map(([uin, entry]) => ({ ...entry, uin: String(uin) }));
}
