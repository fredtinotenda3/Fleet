// infrastructure/security/client-ip.ts
//
// BACKLOG ITEM 3 -- one definition of "who is this request from".
//
// ---------------------------------------------------------------------
// THE DEFECT THIS REPLACES
// ---------------------------------------------------------------------
// Six copies of this line existed in the tree:
//
//     req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
//
// `X-Forwarded-For` is APPENDED to as a request crosses each proxy:
//
//     X-Forwarded-For: <client>, <proxy1>, <proxy2>
//
// The LEFTMOST entry is therefore whatever the first hop received --
// and if the client sent the header itself, the first hop received the
// client's own invention. Taking `[0]` means the value is chosen by the
// caller, which has three consequences here, in ascending order of
// seriousness:
//
//   1. Rate limiting is defeated outright. A caller who varies
//      `X-Forwarded-For` per request lands in a different bucket every
//      time and has no effective limit at all. That is finding F-8's
//      other half: even a correct distributed store counts nothing if
//      the key is attacker-chosen.
//   2. Threat detection records the attacker's chosen address, so
//      brute-force lockout and the rate-limit-anomaly signal both key on
//      a value the attacker controls.
//   3. The audit trail and session records attribute actions to a
//      forged IP, which is worse than recording none: it looks like
//      evidence.
//
// ---------------------------------------------------------------------
// THE MODEL: COUNT TRUSTED HOPS FROM THE RIGHT
// ---------------------------------------------------------------------
// The only honest way to read `X-Forwarded-For` is to know how many
// proxies sit in front of the application, because exactly that many
// entries at the RIGHT-HAND end were written by infrastructure you
// control. Everything to the left of them is client-supplied.
//
// With one trusted hop (Vercel, Fly, a single nginx -- the shape this
// platform actually deploys in), the address the trusted proxy observed
// is the LAST entry. So:
//
//     ip = entries[entries.length - trustedHops]
//
// `TRUSTED_PROXY_HOPS` (default 1) makes that explicit and
// deployment-configurable rather than assumed. A deployment with a CDN
// in front of the platform proxy sets 2.
//
// ---------------------------------------------------------------------
// PLATFORM HEADERS ARE PREFERRED WHERE THE PLATFORM SETS THEM
// ---------------------------------------------------------------------
// "Use the platform's existing proxy handling if present": some hosts
// publish a single-valued header that their edge OVERWRITES rather than
// appends to, which removes the hop-counting question entirely. Those
// are preferred when the platform is detected, and only then:
//
//   * Vercel (`process.env.VERCEL`) -> `x-vercel-forwarded-for`, then
//     `x-real-ip`. Both are set by Vercel's edge on every request.
//   * Cloudflare -> `cf-connecting-ip`, but ONLY when explicitly
//     configured via `TRUSTED_CLIENT_IP_HEADER`, because a
//     `CF-Connecting-IP` header on a deployment that is NOT behind
//     Cloudflare is just another client-supplied string.
//
// That last point is the general rule and the reason this file does not
// simply try a list of well-known headers: OUTSIDE a detected platform,
// no forwarded header is trustworthy by default. Trust has to be
// configured, because it is a property of the deployment, not of the
// request.
//
// ---------------------------------------------------------------------
// WHY 'unknown' RATHER THAN A THROW
// ---------------------------------------------------------------------
// An unresolvable client IP must not fail a request: the platform runs
// behind at least one proxy in every deployment target, but a health
// probe or an internal call may legitimately arrive with no forwarded
// header at all. Callers get the literal 'unknown', which is a single
// shared rate-limit bucket -- deliberately the CONSERVATIVE direction,
// since unattributable traffic sharing one budget is a smaller problem
// than unattributable traffic having none.

/** The minimal shape this module needs. Matches NextRequest and Request. */
export interface HeaderCarrier {
  headers: { get(name: string): string | null };
}

/** Returned when no address can be attributed. Never null, so it is safe in a cache key. */
export const UNKNOWN_CLIENT_IP = 'unknown';

export type ClientIpSource =
  | 'configured-header'
  | 'vercel'
  | 'forwarded-for'
  | 'none';

export interface ResolvedClientIp {
  /** The attributed address, or `UNKNOWN_CLIENT_IP`. */
  ip: string;
  /** Which rule produced it. Surfaced for tests and for diagnosing a misconfigured proxy count. */
  source: ClientIpSource;
}

const DEFAULT_TRUSTED_PROXY_HOPS = 1;

/**
 * How many proxies in front of this app are trusted to have appended a
 * truthful entry to `X-Forwarded-For`.
 *
 * Refused rather than defaulted on a bad value, matching
 * telemetry-retention.config.ts: silently substituting 1 for a
 * mistyped 2 would re-introduce exactly the spoofing this file exists
 * to prevent, and the operator would never learn their setting was
 * ignored.
 */
export function trustedProxyHops(): number {
  const raw = process.env.TRUSTED_PROXY_HOPS;
  if (raw === undefined || raw.trim() === '') return DEFAULT_TRUSTED_PROXY_HOPS;

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(
      `TRUSTED_PROXY_HOPS must be an integer >= 1. Received: ${JSON.stringify(raw)}. ` +
        'It is the number of reverse proxies in front of this application whose ' +
        'X-Forwarded-For entries can be believed; 0 would mean no forwarded header is ' +
        'trustworthy, which this platform cannot deploy in.'
    );
  }
  return parsed;
}

/**
 * Strips a port and IPv6 brackets, then checks the remainder actually
 * looks like an address.
 *
 * Validation is not cosmetic: without it, a forged
 * `X-Forwarded-For: <4KB of junk>` becomes a 4KB Redis key, and a value
 * containing a delimiter used by a downstream key format could collide
 * two buckets deliberately.
 */
export function normalizeIp(candidate: string | null | undefined): string | null {
  if (!candidate) return null;
  let value = candidate.trim();
  if (value === '') return null;

  // [2001:db8::1]:443 -> 2001:db8::1
  const bracketed = /^\[([^\]]+)\](?::\d{1,5})?$/.exec(value);
  if (bracketed) {
    value = bracketed[1];
  } else if (/^\d{1,3}(\.\d{1,3}){3}:\d{1,5}$/.test(value)) {
    // 203.0.113.4:51234 -> 203.0.113.4. Only stripped for IPv4: a bare
    // IPv6 address is full of colons and must not be truncated at one.
    value = value.slice(0, value.lastIndexOf(':'));
  }

  if (isIPv4(value) || isIPv6(value)) return value;
  return null;
}

function isIPv4(value: string): boolean {
  const parts = value.split('.');
  if (parts.length !== 4) return false;
  return parts.every((part) => {
    if (!/^\d{1,3}$/.test(part)) return false;
    const n = Number(part);
    return n >= 0 && n <= 255;
  });
}

function isIPv6(value: string): boolean {
  // Deliberately a shape check rather than a full RFC 4291 parser: the
  // purpose is to reject junk and delimiters, not to validate routing.
  if (!value.includes(':')) return false;
  if (!/^[0-9a-fA-F:.]+$/.test(value)) return false;
  if (value.split('::').length > 2) return false;
  return value.split(':').every((group) => group === '' || /^[0-9a-fA-F]{1,4}$/.test(group) || isIPv4(group));
}

/** Reads the single-valued header an operator has declared trustworthy. */
function configuredHeader(req: HeaderCarrier): string | null {
  const name = process.env.TRUSTED_CLIENT_IP_HEADER?.trim();
  if (!name) return null;
  return normalizeIp(req.headers.get(name.toLowerCase()));
}

/**
 * Vercel sets both of these at its edge on every request; neither is
 * passed through from the client. Detected from `process.env.VERCEL`
 * rather than trusted unconditionally -- see the header comment.
 */
function vercelHeader(req: HeaderCarrier): string | null {
  if (!process.env.VERCEL) return null;
  const vercelForwarded = req.headers.get('x-vercel-forwarded-for');
  if (vercelForwarded) {
    // Documented as single-valued, but read defensively: if it ever
    // carries a list, the platform's own entry is the last one.
    const entries = splitForwarded(vercelForwarded);
    const ip = normalizeIp(entries[entries.length - 1]);
    if (ip) return ip;
  }
  return normalizeIp(req.headers.get('x-real-ip'));
}

function splitForwarded(raw: string): string[] {
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '');
}

/**
 * `X-Forwarded-For`, read from the right by trusted-hop count.
 *
 * A chain SHORTER than the configured hop count means the request did
 * not traverse the proxies this deployment expects. The entry is not
 * attributable, so nothing is returned rather than falling back to the
 * leftmost value -- falling back is the defect.
 */
function forwardedFor(req: HeaderCarrier, hops: number): string | null {
  const raw = req.headers.get('x-forwarded-for');
  if (!raw) return null;

  const entries = splitForwarded(raw);
  if (entries.length < hops) return null;

  return normalizeIp(entries[entries.length - hops]);
}

/**
 * The client address for this request, with the rule that produced it.
 */
export function resolveClientIp(req: HeaderCarrier): ResolvedClientIp {
  const configured = configuredHeader(req);
  if (configured) return { ip: configured, source: 'configured-header' };

  const vercel = vercelHeader(req);
  if (vercel) return { ip: vercel, source: 'vercel' };

  const forwarded = forwardedFor(req, trustedProxyHops());
  if (forwarded) return { ip: forwarded, source: 'forwarded-for' };

  return { ip: UNKNOWN_CLIENT_IP, source: 'none' };
}

/**
 * The client address, or `UNKNOWN_CLIENT_IP`.
 *
 * This is the function every call site should use. It replaced six
 * separate `x-forwarded-for.split(',')[0]` copies.
 */
export function getClientIp(req: HeaderCarrier): string {
  return resolveClientIp(req).ip;
}

/**
 * The client address, or `undefined` when unattributable.
 *
 * For the call sites that RECORD an address (audit entries, session
 * rows, OAuth client registrations) rather than key on one. Those must
 * distinguish "we do not know" from a literal string 'unknown' that
 * later reads as a value.
 */
export function getClientIpOrUndefined(req: HeaderCarrier): string | undefined {
  const { ip } = resolveClientIp(req);
  return ip === UNKNOWN_CLIENT_IP ? undefined : ip;
}
