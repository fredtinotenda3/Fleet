// modules/telematics/adapters/eagletrack/eagletrack-date-range.ts
//
// The `dateRange` query parameter that GET /api2/history and
// GET /api2/reports/<n> take.
//
// ---------------------------------------------------------------------
// WHY THIS IS A FILE RATHER THAN A TEMPLATE STRING
// ---------------------------------------------------------------------
// Every other Eagle Track wire detail in this integration was confirmed
// against a live deployment before it shipped: the query-string token,
// the `?user=` selector, the text/html-labelled JSON, the absence of
// __platenumber. The `dateRange` ENCODING was not -- the vendor's
// documentation writes it as `dateRange=...` and never spells out the
// separator, and no live call has been made against these endpoints.
//
// Hardcoding one guess would fail in the worst possible way: api2
// reports failure inside an HTTP 200 (`{"error": <code>}`), so a
// rejected range surfaces as a sync error rather than as anything that
// names the encoding, and a deployment that is merely LENIENT about the
// separator might return an empty window instead -- indistinguishable
// from "this vehicle didn't move".
//
// So the encodings are enumerated here, ordered, and the client retries
// the next one ONLY on an explicit vendor error envelope (see
// requestWithDateRange in eagletrack-api.client.ts). Never on an empty
// result: an empty history window is a legitimate answer and retrying it
// would triple the request count for every parked vehicle.
//
// Bounded by construction: at most ENCODINGS.length attempts, and the
// client caches whichever one worked for the rest of its lifetime.
// Correcting this once the real format is known is a one-line reorder of
// the array below -- no code change anywhere else.
//
// ---------------------------------------------------------------------
// TIMEZONE
// ---------------------------------------------------------------------
// Formatted in UTC, for exactly the reason parseEagleTrackDate parses in
// UTC (see its doc comment): the vendor sends no offset and no
// designator, so server-local formatting would make the same request
// mean different things on a developer laptop and a production
// container. Both ends of the conversation therefore use one clock, and
// the assumption is stated in one place rather than implied in two.
//
// KNOWN LIMITATION, recorded rather than hidden: if the deployment
// actually renders timestamps in the token user's configured timezone
// (its user object carries a `timezone` offset, which is what suggests
// it), a requested window will be shifted by that offset. The window is
// echoed back on every response (`EagleTrackRangeQuery.encoded`) so the
// discrepancy is visible in one look instead of being a mystery about
// missing points at the edges of a day.

/** How the two ends of a range are joined into one `dateRange` value. */
export type EagleTrackDateRangeEncoding = 'pipe' | 'comma' | 'underscore';

/**
 * Attempt order. The pipe form is first because it is the separator this
 * api2 family uses in its other compound parameters and the one least
 * likely to collide with a locale-formatted date.
 */
export const EAGLETRACK_DATE_RANGE_ENCODINGS: readonly EagleTrackDateRangeEncoding[] = [
  'pipe',
  'comma',
  'underscore',
];

const SEPARATORS: Record<EagleTrackDateRangeEncoding, string> = {
  pipe: '|',
  comma: ',',
  underscore: '_',
};

/**
 * The vendor's own timestamp format ("YYYY-MM-DD HH:mm:ss"), rendered in
 * UTC. Matches what parseEagleTrackDate reads back, so a round trip
 * through this integration is symmetric.
 */
export function formatEagleTrackTimestamp(value: Date): string {
  const pad = (n: number, width = 2) => String(n).padStart(width, '0');
  return (
    `${pad(value.getUTCFullYear(), 4)}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())} ` +
    `${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}:${pad(value.getUTCSeconds())}`
  );
}

/** The `dateRange` value for one window under one encoding. */
export function encodeEagleTrackDateRange(
  from: Date,
  to: Date,
  encoding: EagleTrackDateRangeEncoding
): string {
  return `${formatEagleTrackTimestamp(from)}${SEPARATORS[encoding]}${formatEagleTrackTimestamp(to)}`;
}

/**
 * The window a caller asked for, together with exactly what went on the
 * wire for it.
 *
 * Returned on every history/report response so an operator diagnosing
 * "why are there no points" can see the encoding and the UTC window that
 * were actually used, rather than inferring them from this file.
 */
export interface EagleTrackRangeQuery {
  from: string;
  to: string;
  encoding: EagleTrackDateRangeEncoding;
  encoded: string;
}

/**
 * Clamps a caller-supplied window and refuses an inverted or absurd one.
 *
 * `maxSpanMs` exists so an HTTP caller cannot ask a vendor endpoint for
 * ten years of second-resolution history and stall a serverless
 * function until it is killed -- the same reasoning behind
 * MAX_ROUTE_HISTORY_MINUTES in live-map.service.ts, applied at the
 * provider boundary as well as at ours.
 *
 * Returns the clamped window. Throws for a window that cannot be
 * repaired without guessing what the caller meant (`from` after `to`),
 * because silently swapping them would answer a question nobody asked.
 */
export function clampRange(
  from: Date,
  to: Date,
  maxSpanMs: number
): { from: Date; to: Date } {
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw new Error('Eagle Track date range: from/to must both be valid dates');
  }
  if (from.getTime() > to.getTime()) {
    throw new Error('Eagle Track date range: `from` must not be after `to`');
  }

  const span = to.getTime() - from.getTime();
  if (span <= maxSpanMs) return { from, to };

  // Keep the END of the window and move the start forward: a caller
  // asking for "the last N months" almost always wants the recent end
  // of it, and truncating the other way returns the oldest slice, which
  // looks like the integration is broken rather than capped.
  return { from: new Date(to.getTime() - maxSpanMs), to };
}
