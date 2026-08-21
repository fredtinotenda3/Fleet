// modules/telematics/adapters/eagletrack/eagletrack-field-map.ts
//
// Reading values out of Eagle Track payloads whose exact field names are
// NOT confirmed against a live deployment.
//
// ---------------------------------------------------------------------
// WHY CANDIDATE ALIASES RATHER THAN FIELD NAMES
// ---------------------------------------------------------------------
// Four of the five endpoints added in this pass -- /api2/reports/fuel,
// /api2/drivers, /api2/triggers, and the alert-filtered form of
// /api2/history -- have never been called against a live deployment.
// Everything this integration knows about their shape comes from vendor
// documentation, and this codebase has already established, in writing,
// that the documentation is not a reliable contract: `__platenumber` is
// documented and absent, the `token` header is documented and does not
// authenticate, `uin=__all_sub` is documented and rejected outright.
//
// Two ways to handle that, and only one of them is honest:
//
//   * Pick a field name per value and ship it. If the guess is wrong the
//     value reads as `undefined` forever, which -- because every field
//     in this integration is optional by design -- renders as "No data"
//     and looks exactly like a device that does not report it. A silent
//     permanent wrong answer.
//   * Enumerate the plausible spellings as DATA, record which one
//     actually matched, and report the keys that matched nothing. A
//     wrong guess then shows up as a named unmapped key in the API
//     response rather than as an absence.
//
// This file is the second. Nothing here invents a value: if no candidate
// matches, the field is absent -- never 0, never '', never a fabricated
// default. That is the same rule the `?? 0` removal established for the
// live path, applied to fields whose NAMES are unknown rather than whose
// VALUES are.
//
// ---------------------------------------------------------------------
// KEY NORMALISATION IS CANONICALISATION, NOT GUESSING
// ---------------------------------------------------------------------
// Candidates are matched after lowercasing and removing `_`/`-`/spaces,
// so `fuel_used`, `fuelUsed`, `FuelUsed` and `fuel used` are one
// candidate rather than four. That is the same argument
// findByLicensePlate's case-folding rests on: it collapses spellings of
// the SAME name, and cannot make one name match a different name. It
// does not widen what matches semantically -- `fuelUsed` still never
// matches `fuelLevel`.
//
// ---------------------------------------------------------------------
// CORRECTING THIS FILE
// ---------------------------------------------------------------------
// Every response built on these readers carries `unmappedFields` (see
// describeUnmapped). Run one real request, read the list, and add the
// real spelling to the front of the relevant alias array. No code
// changes anywhere else -- that is the whole point of keeping the
// mapping as data.

/** A value that was read, and the vendor key it actually came from. */
export interface FieldHit<T> {
  /** The key as it appeared in the vendor payload, verbatim. */
  key: string;
  value: T;
}

export type VendorRow = Record<string, unknown>;

/**
 * Collapses spellings of one name. See the header: this folds case and
 * separators only, so it can never map one name onto a different one.
 */
export function normaliseKey(key: string): string {
  return key.toLowerCase().replace(/[\s_-]+/g, '');
}

/**
 * Builds a lookup from normalised key -> { originalKey, value } for one
 * vendor row. Built once per row rather than per field so a payload with
 * forty keys is not walked once per canonical field we look for.
 *
 * A collision (two keys that normalise the same, e.g. `fuel_used` and
 * `fuelUsed` on one row) keeps the FIRST occurrence. Vendor payloads
 * that do this are pathological, and picking the first is at least
 * deterministic and reported -- the loser stays in `unmappedFields`
 * rather than vanishing.
 */
export function indexRow(row: VendorRow): Map<string, { key: string; value: unknown }> {
  const index = new Map<string, { key: string; value: unknown }>();
  for (const [key, value] of Object.entries(row)) {
    const normalised = normaliseKey(key);
    if (!index.has(normalised)) index.set(normalised, { key, value });
  }
  return index;
}

/**
 * The raw entry for the first alias present on the row, or null.
 *
 * Order within `aliases` is priority order: put the spelling a live
 * deployment was observed to use first, documented spellings after it.
 */
function pick(
  index: Map<string, { key: string; value: unknown }>,
  aliases: readonly string[]
): { key: string; value: unknown } | null {
  for (const alias of aliases) {
    const hit = index.get(normaliseKey(alias));
    if (hit && hit.value !== undefined && hit.value !== null && hit.value !== '') return hit;
  }
  return null;
}

/**
 * A finite number under one of `aliases`.
 *
 * Numeric strings are accepted for the same reason pickNumericIo accepts
 * them: white-labelled deployments of this platform have been observed
 * to stringify numerics. Booleans are rejected -- `true` coerces to 1
 * and would become a fuel reading of one litre.
 */
export function readNumber(
  index: Map<string, { key: string; value: unknown }>,
  aliases: readonly string[]
): FieldHit<number> | null {
  const hit = pick(index, aliases);
  if (!hit || typeof hit.value === 'boolean') return null;

  const value = typeof hit.value === 'number' ? hit.value : Number(hit.value);
  return Number.isFinite(value) ? { key: hit.key, value } : null;
}

/**
 * A non-empty trimmed string under one of `aliases`.
 *
 * Numbers are stringified deliberately: vendor ids (`uin`, a driver id,
 * a trigger id) arrive sometimes quoted and sometimes not, and an id
 * that changes type between deployments must not change whether it
 * matches. Objects and arrays are rejected outright -- an object
 * reaching a Mongo filter is the misattribution hazard
 * plateCandidatesFromTracker's typeof guard exists to block.
 */
export function readString(
  index: Map<string, { key: string; value: unknown }>,
  aliases: readonly string[]
): FieldHit<string> | null {
  const hit = pick(index, aliases);
  if (!hit) return null;

  if (typeof hit.value === 'string') {
    const trimmed = hit.value.trim();
    return trimmed ? { key: hit.key, value: trimmed } : null;
  }
  if (typeof hit.value === 'number' && Number.isFinite(hit.value)) {
    return { key: hit.key, value: String(hit.value) };
  }
  return null;
}

/**
 * A boolean under one of `aliases`, using the same 0/1-and-strings
 * tolerance pickBooleanIo applies to the io bag. Returns null when
 * absent -- "not reported" and "reported false" stay distinct.
 */
export function readBoolean(
  index: Map<string, { key: string; value: unknown }>,
  aliases: readonly string[]
): FieldHit<boolean> | null {
  const hit = pick(index, aliases);
  if (!hit) return null;

  if (typeof hit.value === 'boolean') return { key: hit.key, value: hit.value };
  if (typeof hit.value === 'number') return { key: hit.key, value: hit.value !== 0 };
  if (typeof hit.value === 'string') {
    const normalised = hit.value.trim().toLowerCase();
    if (normalised === 'true' || normalised === '1' || normalised === 'yes') {
      return { key: hit.key, value: true };
    }
    if (normalised === 'false' || normalised === '0' || normalised === 'no') {
      return { key: hit.key, value: false };
    }
  }
  return null;
}

/**
 * A latitude/longitude pair, when the row carries one.
 *
 * Applies the SAME null-island and range rejection hasUsableFix applies
 * to live fixes, and for the same reason: a tracker or a geofence
 * centred at exactly (0, 0) is a device with no lock, not a site in the
 * Gulf of Guinea. Sharing the rule rather than restating it is why this
 * takes the validator as an argument.
 */
export function readLatLng(
  index: Map<string, { key: string; value: unknown }>,
  latAliases: readonly string[],
  lngAliases: readonly string[]
): { lat: number; lng: number; keys: string[] } | null {
  const lat = readNumber(index, latAliases);
  const lng = readNumber(index, lngAliases);
  if (!lat || !lng) return null;
  if (lat.value < -90 || lat.value > 90 || lng.value < -180 || lng.value > 180) return null;
  if (lat.value === 0 && lng.value === 0) return null;
  return { lat: lat.value, lng: lng.value, keys: [lat.key, lng.key] };
}

/**
 * Vendor keys on `row` that no reader consumed.
 *
 * This is the diagnostic that makes candidate matching correctable
 * instead of merely defensive: it is surfaced on every API response
 * built from these payloads, so one real request tells an operator
 * exactly which spellings to add to the alias arrays. Sorted so a
 * response diff between two syncs is stable.
 *
 * Capped: an unbounded vendor key list on an HTTP response is a payload
 * an attacker could inflate by pointing the integration at a hostile
 * deployment, and forty keys is already far more than anyone reads.
 */
const MAX_REPORTED_UNMAPPED_KEYS = 40;

export function describeUnmapped(row: VendorRow, consumedKeys: Iterable<string>): string[] {
  const consumed = new Set<string>();
  for (const key of consumedKeys) consumed.add(key);

  return Object.keys(row)
    .filter((key) => !consumed.has(key))
    .sort()
    .slice(0, MAX_REPORTED_UNMAPPED_KEYS);
}

/**
 * Collects the keys a set of FieldHits came from, for describeUnmapped.
 * Nulls are skipped, so "we looked for it and it was not there" does not
 * accidentally mark a key as consumed.
 */
export function consumed(...hits: Array<FieldHit<unknown> | { keys: string[] } | null>): string[] {
  const keys: string[] = [];
  for (const hit of hits) {
    if (!hit) continue;
    if ('keys' in hit) keys.push(...hit.keys);
    else keys.push(hit.key);
  }
  return keys;
}

/**
 * Coerces an envelope's `data` into an array of plain objects.
 *
 * Every endpoint added in this pass returns a LIST, but the platform is
 * inconsistent about how: `/api2/last` returns an object keyed by uin
 * while `/api2/history` returns an array (see flattenLastPayload's
 * comment). Rather than assume per endpoint, this accepts either and
 * discards anything that is not an object -- a string or a number in a
 * list of records is malformed, and mapping it would produce a row of
 * pure absences that looks like real but empty data.
 */
export function toRows(data: unknown): VendorRow[] {
  if (!data) return [];
  if (Array.isArray(data)) {
    return data.filter((entry): entry is VendorRow => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry));
  }
  if (typeof data === 'object') {
    return Object.values(data as Record<string, unknown>).filter(
      (entry): entry is VendorRow => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry)
    );
  }
  return [];
}

/**
 * Same as toRows, but keeps the object KEY alongside each row for
 * object-shaped payloads.
 *
 * `/api2/last` proved that the key can be more authoritative than the
 * field inside the entry (the client stamps `uin` from the key so a
 * vendor-side inconsistency between the two cannot re-attribute a fix).
 * Endpoints whose payload may be keyed by uin get the same treatment.
 */
export function toKeyedRows(data: unknown): Array<{ key: string | null; row: VendorRow }> {
  if (!data) return [];
  if (Array.isArray(data)) {
    return toRows(data).map((row) => ({ key: null, row }));
  }
  if (typeof data === 'object') {
    return Object.entries(data as Record<string, unknown>)
      .filter(([, entry]) => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry))
      .map(([key, entry]) => ({ key, row: entry as VendorRow }));
  }
  return [];
}
