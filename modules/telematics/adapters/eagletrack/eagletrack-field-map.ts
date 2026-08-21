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
 *
 * Exported as `pickRaw` for eagletrack-report-values.ts, which needs the
 * UNINTERPRETED cell in order to tell "-" (the provider stating it has
 * no figure) apart from an absent key. Every reader in this file and
 * that one resolves aliases through this single function, so priority
 * order cannot diverge between them.
 */
export function pickRaw(
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
  const hit = pickRaw(index, aliases);
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
  const hit = pickRaw(index, aliases);
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
  const hit = pickRaw(index, aliases);
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
 * A vendor counter (`pageCount`, `recCount`) as a number, or null.
 *
 * White-labelled deployments stringify these inconsistently -- the live
 * fuel report sends `pageCount` as a number and `recCount` as the string
 * "1318" in the SAME object. One reader, so a counter cannot be trusted
 * in one code path and dropped in another.
 */
export function readCounter(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === '') return null;
  const value = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(value) ? value : null;
}

/**
 * A `{ column: [...], body: [[...]] }` payload, expanded into rows.
 *
 * ---------------------------------------------------------------------
 * WHY THIS SHAPE NEEDS ITS OWN READER
 * ---------------------------------------------------------------------
 * The /api2/reports/* endpoints do not return records. They return a
 * rendered TABLE: a header array and an array of positional cell arrays,
 * alongside a nested `global` counter block. Neither toRows nor
 * toKeyedRows could see rows in that, and toKeyedRows did something
 * worse than see nothing -- `column` and `body` are arrays so both were
 * filtered out, `global` is an object so it survived, and the whole
 * report parsed as exactly one row whose fields were `pageCount` and
 * `recCount`, attributed to a tracker named "global". A confident,
 * entirely fictional row.
 *
 * Expanding to keyed rows here rather than writing a separate columnar
 * parser is what lets the alias tables, indexRow, describeUnmapped and
 * every reader keep working unchanged: a header of "Fuel Used" becomes
 * the key "Fuel Used", which normalises to the alias `fuelUsed` that was
 * already in the table.
 *
 * ---------------------------------------------------------------------
 * POSITIONAL MAPPING IS ONLY AS GOOD AS THE WIDTHS
 * ---------------------------------------------------------------------
 * Every cell is placed by INDEX, so a body row of a different length
 * than the header is the one failure mode that silently shifts values
 * into neighbouring fields -- an odometer landing in a distance column.
 * The overlap is still mapped (partial data is data), but the row count
 * is reported so a caller can warn instead of quietly presenting
 * misaligned figures. Cells beyond the header get the synthetic key
 * `column[N]`, which no alias matches, so they surface in
 * `unmappedFields` rather than vanishing.
 *
 * Returns null -- meaning "not this shape, carry on" -- unless `column`
 * is an array of strings AND `body` is an array. The guard is strict on
 * purpose: a keyed payload that happens to contain a `body` field must
 * not be reinterpreted as a table.
 */
export interface ColumnarPayload {
  /** Header labels, in order, after blank/duplicate disambiguation. */
  columns: string[];
  rows: VendorRow[];
  /** The nested `global` block, which sits INSIDE `data` on this endpoint rather than beside it. */
  counters: { pageCount: number | null; recordCount: number | null };
  /** Headers that repeat. The first wins for alias matching; the rest are suffixed and reported. */
  duplicateColumns: string[];
  /** Body rows whose cell count differed from the header count. See above. */
  rowsWithUnexpectedWidth: number;
}

export function readColumnarPayload(data: unknown): ColumnarPayload | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;

  const record = data as Record<string, unknown>;
  const rawColumns = record.column ?? record.columns;
  const rawBody = record.body;

  if (!Array.isArray(rawColumns) || !Array.isArray(rawBody)) return null;
  if (!rawColumns.every((entry) => typeof entry === 'string')) return null;

  const columns: string[] = [];
  const duplicateColumns: string[] = [];
  const seen = new Set<string>();

  rawColumns.forEach((entry, position) => {
    // A blank header cannot be an object key that any alias matches, and
    // an empty string would collide with the next blank one.
    const label = (entry as string).trim() || `column[${position}]`;
    const normalised = normaliseKey(label);

    if (seen.has(normalised)) {
      duplicateColumns.push(label);
      // Suffixed so both copies reach the row. The first still wins for
      // alias matching (indexRow keeps the first); the loser shows up in
      // unmappedFields instead of overwriting the winner.
      columns.push(`${label} [${position}]`);
      return;
    }

    seen.add(normalised);
    columns.push(label);
  });

  const rows: VendorRow[] = [];
  let rowsWithUnexpectedWidth = 0;

  for (const entry of rawBody) {
    if (Array.isArray(entry)) {
      if (entry.length !== columns.length) rowsWithUnexpectedWidth += 1;

      const row: VendorRow = {};
      entry.forEach((cell, position) => {
        row[columns[position] ?? `column[${position}]`] = cell;
      });
      rows.push(row);
      continue;
    }

    // A deployment that returns already-keyed objects inside `body` is
    // handled rather than rejected; scalars are dropped, exactly as
    // toRows drops them.
    if (entry && typeof entry === 'object') rows.push(entry as VendorRow);
  }

  const global = (record.global ?? {}) as Record<string, unknown>;

  return {
    columns,
    rows,
    counters: {
      pageCount: readCounter(global.pageCount),
      recordCount: readCounter(global.recCount ?? global.recordCount),
    },
    duplicateColumns,
    rowsWithUnexpectedWidth,
  };
}

/**
 * Coerces an envelope's `data` into an array of plain objects.
 *
 * Every endpoint added in this pass returns a LIST, but the platform is
 * inconsistent about how: `/api2/last` returns an object keyed by uin,
 * `/api2/history` returns an array (see flattenLastPayload's comment),
 * and `/api2/reports/*` returns a column/body TABLE. Rather than assume
 * per endpoint, this accepts all three and discards anything that is not
 * an object -- a string or a number in a list of records is malformed,
 * and mapping it would produce a row of pure absences that looks like
 * real but empty data.
 */
export function toRows(data: unknown): VendorRow[] {
  const columnar = readColumnarPayload(data);
  if (columnar) return columnar.rows;

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
 *
 * A column/body table yields key `null` for every row, and that is not a
 * shortcut: a report row carries no identifier in its position in the
 * table, so there is nothing authoritative to stamp. Callers must decide
 * attribution from a column, never from the row's index.
 */
export function toKeyedRows(data: unknown): Array<{ key: string | null; row: VendorRow }> {
  const columnar = readColumnarPayload(data);
  if (columnar) return columnar.rows.map((row) => ({ key: null, row }));

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
