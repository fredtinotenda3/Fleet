// modules/transport-cost/utils/normalization.utils.ts
//
// Extracted verbatim from Phase O1's import-transport-cost.handler.ts
// (no behavior change -- see that file's git history for the original
// inline versions) so Phase O2's normalization-matcher.service.ts can
// import the EXACT SAME functions rather than a re-implementation that
// could silently drift. The user's Phase O2/O3 implementation
// instruction is explicit about this: reuse O1's conventions, don't
// re-derive them.
//
// Both parseSourceDate/parseAmount and the transporter/registration
// normalizers are pure and side-effect-free, so lifting them out here
// has no runtime implications for O1's already-shipped, already-tested
// import path -- only the import path of these declarations changed.

// Values seen in the source data's Transporter/TRUCK columns that are
// clearly not transporter names -- a mis-entered spreadsheet label, not
// a company (audit Section K: "VAT EXCL" appears seven times in the
// Transporter column across the workbook). Rejected rather than
// imported as if it were a real transporter, so it can never silently
// pollute a future transporter master list or cost-by-transporter
// report. O2's matcher re-checks this set as defense-in-depth before
// ever creating/matching a TransportPartner -- see
// normalization-matcher.service.ts.
export const KNOWN_INVALID_TRANSPORTER_VALUES = new Set(['VAT EXCL', 'VAT INCL', 'N/A', 'NA', 'TOTAL']);

const DATE_DMY_RE = /^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/;
const DATE_ISO_RE = /^(\d{4})-(\d{2})-(\d{2})/;

/**
 * Parses the two date shapes actually seen in Olivine's source sheets
 * (audit Section K): free-text `DD.MM.YY` / `DD.MM.YYYY`, and ISO
 * `YYYY-MM-DD` strings -- the latter now a REAL, not hypothetical, shape
 * since the Swift slice: a genuinely Excel-date-typed cell (Swift's
 * "Cons. date") round-trips through shared/utils/excel-parser.utils.ts's
 * `stringifyCell()` as a LOCAL `YYYY-MM-DD` string (deliberately built
 * from `.getFullYear()/.getMonth()/.getDate()`, never `.toISOString()`,
 * specifically so a date-only cell never shifts to the previous day for
 * a timezone behind UTC -- see that function's own header). Deliberately
 * does NOT fall back to `new Date(raw)` for anything else -- that
 * constructor's locale-dependent parsing of ambiguous strings is exactly
 * the kind of silent coercion the audit's Section K calls for "parse
 * defensively and reject rather than silently coerce".
 *
 * Both branches below build the `Date` from the regex's captured
 * year/month/day digits via `new Date(year, month - 1, day)` (LOCAL
 * midnight), never via `new Date(aDateOnlyString)`. That constructor
 * form is a well-known trap: per the ECMA-262 Date Time String Format,
 * a date-only ISO string (no time component) parses as UTC midnight,
 * not local midnight -- which would silently re-introduce, one layer up,
 * exactly the previous-day shift `stringifyCell()` was written to avoid,
 * for any deployment west of UTC. Building from the captured digits
 * sidesteps that trap entirely and keeps both branches' semantics
 * identical: "the calendar date this cell names, at local midnight",
 * never a UTC-vs-local off-by-one.
 */
export function parseSourceDate(raw: string): Date | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const dmy = DATE_DMY_RE.exec(trimmed);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    let year = Number(dmy[3]);
    if (dmy[3].length === 2) year += 2000;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const d = new Date(year, month - 1, day);
    // Guards against JS's date-rollover behaviour for invalid combinations
    // (e.g. "31.02.26" would otherwise silently become March 3rd).
    if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) {
      return null;
    }
    return d;
  }

  const iso = DATE_ISO_RE.exec(trimmed);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const d = new Date(year, month - 1, day);
    // Same rollover guard as the DMY branch above (e.g. "2026-02-31").
    if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) {
      return null;
    }
    return d;
  }

  return null;
}

/**
 * Never returns 0 for a blank/unparseable cell -- returns null instead.
 * Coercing a blank Amount to 0 is the specific mistake this codebase's
 * data-truth convention exists to avoid (tests/security/
 * fabricated-metrics.spec.ts, honest-metrics.spec.ts).
 */
export function parseAmount(value: string | number | undefined | null): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const trimmed = String(value).trim();
  if (trimmed === '') return null;
  const cleaned = trimmed.replace(/[^0-9.-]/g, '');
  if (cleaned === '' || cleaned === '-') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

const PERIOD_MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

/**
 * Parses a required, explicitly-supplied "YYYY-MM" period-month string
 * into calendar-month boundaries -- Vansales periodization Option A, see
 * VANSALES_PERIODIZATION_DECISION.md. This is deliberately the ONLY way
 * a Vansales row's posting period is ever determined: never inferred
 * from a sheet-tab name or any other free text. Returns null for
 * anything that is not exactly "YYYY-MM" with a valid month (01-12);
 * the caller (TransportCostPostingService) treats null as
 * `reason: 'missing-period-month'` and skips rather than guessing.
 *
 * Both boundaries are local-midnight Date values, matching
 * parseSourceDate's convention above (a 3rd Party row's `date` is also
 * local midnight) so a Vansales posting's periodStart/periodEnd compare
 * consistently with every other posting in the ledger.
 */
export function parsePeriodMonth(value: string | null | undefined): { periodStart: Date; periodEnd: Date } | null {
  if (!value) return null;
  const match = PERIOD_MONTH_RE.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const periodStart = new Date(year, month - 1, 1);
  const periodEnd = new Date(year, month, 0);
  return { periodStart, periodEnd };
}

export function normalizeRegistration(raw: string | undefined): { normalized: string | null; raw: string } {
  const r = (raw ?? '').toString().trim();
  if (!r) return { normalized: null, raw: r };
  // Collapses internal whitespace and uppercases (audit Section K: at
  // least 40 plates in the source data have multiple raw spellings that
  // differ only by whitespace, e.g. "AGL8230" / "AGL 8230" / "AGL  8230").
  // Deliberately does NOT attempt to split a multi-plate cell (e.g.
  // "AAA 9999/ AAA 9999") -- that is flagged as its own explicit case
  // (O2's isMultiPlate handling), not silently parsed here.
  return { normalized: r.replace(/\s+/g, '').toUpperCase(), raw: r };
}

export function normalizeTransporter(raw: string | undefined): { normalized: string | null; raw: string } {
  const r = (raw ?? '').toString().trim();
  if (!r) return { normalized: null, raw: r };
  return { normalized: r.toUpperCase().replace(/\s+/g, ' '), raw: r };
}

export function isKnownInvalidTransporter(normalized: string | null): boolean {
  return normalized !== null && KNOWN_INVALID_TRANSPORTER_VALUES.has(normalized);
}

/**
 * Detects a multi-plate registration cell (e.g. "AAA 9999/ AAA 9999",
 * "AAA 9999 & BBB 1111" -- audit Section K) from its RAW (pre-
 * normalization) form, since normalizeRegistration already strips the
 * separators that make this detectable. Returns the individual plate
 * tokens for display only -- O2 decision 4: such a row is ALWAYS routed
 * to manual review and NEVER split into separate ContractedVehicle rows
 * or silently resolved to one component.
 */
const MULTI_PLATE_SEPARATOR_RE = /[/&,]|\bAND\b/i;

export function detectMultiPlate(raw: string | undefined): { isMultiPlate: boolean; components: string[] } {
  const r = (raw ?? '').toString().trim();
  if (!r || !MULTI_PLATE_SEPARATOR_RE.test(r)) return { isMultiPlate: false, components: [] };

  const components = r
    .split(MULTI_PLATE_SEPARATOR_RE)
    .map((part) => part.replace(/\s+/g, '').toUpperCase().trim())
    .filter((part) => part.length > 0);

  // A stray separator with fewer than two real plate tokens either side
  // (e.g. a trailing "/" with nothing after it) is not a genuine
  // multi-plate cell -- fall through to ordinary single-plate handling
  // rather than flagging a false positive for review.
  if (components.length < 2) return { isMultiPlate: false, components: [] };

  return { isMultiPlate: true, components };
}
