// modules/telematics/adapters/eagletrack/eagletrack-api.client.ts
//
// Thin HTTP client for Eagle Track's api2 platform. Like
// cartrack-api.client.ts it has no knowledge of tenants, vehicles, or
// our data model -- it authenticates, fetches, and normalises the wire
// format. eagletrack.adapter.ts is the layer that maps this onto our
// TelematicsData ingest pipeline.
//
// THREE THINGS THIS CLIENT DOES THAT CARTRACK'S DOES NOT:
//
//  1. TOKEN IN A HEADER, NEVER THE URL. The vendor's documentation puts
//     `&token=...` in the query string "for convenience". A credential
//     in a URL is written to access logs, proxy logs, and browser/CDN
//     referrers. The vendor's own security note recommends the header
//     form and that is the only form used here.
//
//  2. ENVELOPE ERRORS. api2 answers HTTP 200 with `{"error": <code>}`
//     on failure. Checking `response.ok` alone would treat a rejected
//     token as a successful empty sync -- the worst possible failure
//     mode, because it looks like "this tenant has no vehicles".
//
//  3. OBJECT-KEYED PAYLOAD. `GET /api2/last` returns `data` as an object
//     keyed by uin. getLastForAll flattens it into an array using the
//     key as the authoritative tracker id.

import {
  EagleTrackLastResponse,
  EagleTrackTracker,
  EagleTrackTrackerStatus,
  EagleTrackTrackersResponse,
} from './eagletrack.types';

export class EagleTrackApiError extends Error {
  constructor(
    message: string,
    /** HTTP status, when the failure was at the transport level. */
    public readonly statusCode?: number,
    /** The envelope's `error` code, when the vendor reported failure in the body of an HTTP 200. */
    public readonly vendorErrorCode?: number,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'EagleTrackApiError';
  }

  /**
   * True when the vendor answered coherently and rejected us -- i.e. a
   * credentials/permission verdict rather than a transport problem.
   * Used by verifyCredentials to distinguish "your token is wrong" from
   * "the platform is down", which must not be reported the same way.
   */
  get isVendorRejection(): boolean {
    return this.vendorErrorCode !== undefined || this.statusCode === 401 || this.statusCode === 403;
  }
}

/**
 * `uin` selector for the fleet-wide poll.
 *
 * The vendor documents four selectors: a single tracker id,
 * `__group<id>`, `__all_sub` (every tracker belonging to the token's
 * user and its sub-users) and `__all_sys_` (every tracker on the whole
 * deployment). `__all_sys_` is deliberately NOT used: on a reseller-run
 * instance that would pull other customers' vehicles into this tenant's
 * sync, which is precisely the cross-tenant leak class this codebase has
 * spent several phases eliminating. `__all_sub` is the least-privilege
 * selector that still covers a whole account in one call.
 *
 * The adapter cross-checks the roster against what this returns and
 * reports any tracker the poll did not cover (`trackersWithoutFix`), so
 * if `__all_sub` turns out to under-report on a real deployment that
 * shows up as data rather than as silence.
 */
export const EAGLETRACK_FLEET_SELECTOR = '__all_sub';

export interface EagleTrackApiClientConfig {
  /** Base URL of the tenant's deployment. Path suffixes and trailing slashes are normalised away. */
  domain: string;
  /** Static API token from the vendor UI (Settings -> API Tokens). Sent as a `token` header. */
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
   */
  async getLastForAll(): Promise<EagleTrackTrackerStatus[]> {
    const envelope = await this.request<EagleTrackLastResponse>('/api2/last', {
      uin: EAGLETRACK_FLEET_SELECTOR,
    });

    return flattenLastPayload(envelope.data);
  }

  /** The tracker roster -- uin, name, owner, and the `__platenumber` custom field used for vehicle matching. */
  async getTrackers(): Promise<EagleTrackTracker[]> {
    const envelope = await this.request<EagleTrackTrackersResponse>('/api2/trackers');
    const data = envelope.data;
    if (!Array.isArray(data)) return [];

    return data.filter((tracker): tracker is EagleTrackTracker => {
      return Boolean(tracker) && typeof tracker === 'object' && tracker.uin !== undefined && tracker.uin !== null;
    });
  }

  /**
   * Verifies the stored token authenticates, without pulling a full
   * fleet payload. Backs the "test connection" action in settings.
   *
   * Returns false ONLY for a coherent vendor rejection (an `error` code
   * in the envelope, or HTTP 401/403). A timeout, DNS failure or 5xx is
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

  private async request<T extends { error: number | string; msg?: string }>(
    path: string,
    params: Record<string, string> = {},
    timeoutMs = this.timeoutMs
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          // Header rather than `&token=` in the query string -- see the
          // file header. The vendor supports both.
          token: this.token,
          Accept: 'application/json',
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new EagleTrackApiError(
          `Eagle Track API request failed: ${response.status} ${response.statusText}`,
          response.status,
          undefined,
          body
        );
      }

      const parsed = (await response.json()) as T;

      if (!parsed || typeof parsed !== 'object') {
        throw new EagleTrackApiError('Eagle Track API returned a malformed response body', response.status);
      }

      // The load-bearing check: api2 reports failure inside a 200.
      const vendorError = Number(parsed.error);
      if (Number.isFinite(vendorError) && vendorError !== 0) {
        throw new EagleTrackApiError(
          `Eagle Track API error ${vendorError}${parsed.msg ? `: ${parsed.msg}` : ''}`,
          response.status,
          vendorError
        );
      }

      return parsed;
    } catch (error) {
      if (error instanceof EagleTrackApiError) throw error;
      if ((error as { name?: string })?.name === 'AbortError') {
        throw new EagleTrackApiError(
          `Eagle Track API request timed out after ${timeoutMs}ms`,
          undefined,
          undefined,
          error
        );
      }
      throw new EagleTrackApiError('Eagle Track API request failed', undefined, undefined, error);
    } finally {
      clearTimeout(timeout);
    }
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
