// modules/telematics/adapters/eagletrack/eagletrack-report-values.ts
//
// Reading a REPORT CELL: a display string rather than a JSON value.
//
// ---------------------------------------------------------------------
// WHY THIS EXISTS SEPARATELY FROM eagletrack-field-map.ts
// ---------------------------------------------------------------------
// The field map answers "which key carries this value". This answers
// "what does the value mean", and the two are genuinely different
// problems for /api2/reports/*: the report endpoints do not return typed
// JSON. They return the rows of a rendered table, so every cell is a
// STRING carrying a number, a unit, a currency, an em-dash for "no
// data", or -- in the `Fuel` column -- five separate figures crammed
// into one semicolon-delimited sentence.
//
// readNumber in the field map is correct for `/api2/last`, where a
// number arrives as a number. Pointed at `"7.14 km"` it produces
// `Number("7.14 km")` -> NaN -> null, so a perfectly good distance
// reads as "not reported". Pointed at `"-"` it does the same. Both
// render as "No data" and look exactly like a device that reports
// nothing.
//
// ---------------------------------------------------------------------
// FOUR OUTCOMES, NOT TWO
// ---------------------------------------------------------------------
// Every reader here distinguishes four states, because collapsing them
// is what produces confidently wrong operational conclusions:
//
//   absent      no candidate alias matched a key on the row. The field
//               may simply be missing -- or we may be looking for it
//               under the wrong name. `unmappedFields` tells them apart.
//   no-data     the provider EXPLICITLY said it has none ("-"). This is
//               a positive statement, not an absence, and it is the one
//               the brief calls "No data".
//   unparsable  a value is there and we could not read it. Never
//               guessed, never coerced -- reported by name so the unit
//               table or the alias list can be corrected.
//   value       a finite number, normalised onto the canonical unit.
//
// A zero is NEVER manufactured for any of the first three. That rule is
// this integration's oldest one (the `?? 0` removal) and it matters more
// on a fuel report than anywhere else: "0 L consumed" reads as a vehicle
// that did not move, while "No data" reads as a vehicle with no fuel
// sensor. Those are opposite conclusions drawn from the same row.
//
// ---------------------------------------------------------------------
// UNITS ARE VALIDATED, NEVER ASSUMED
// ---------------------------------------------------------------------
// A unit token the spec does not list makes the cell `unparsable`. It is
// tempting to ignore the suffix and keep the number, and that is exactly
// how io code 199 -- "Fuel Consumption, L/h" -- was once written into a
// field the UI renders as "L/100km". The number survived; its meaning
// did not. Refusing an unrecognised unit turns that class of bug into a
// named entry in `unparsableFields` on the very first response.

import { normaliseKey, pickRaw, VendorRow } from './eagletrack-field-map';

/**
 * Cell values that mean "the provider has no figure for this".
 *
 * The live response uses a bare hyphen; the rest are the spellings this
 * platform family's other rendered reports use for the same thing.
 * Compared after trimming and lower-casing.
 */
const NO_DATA_TOKENS = new Set(['-', '--', '---', 'n/a', 'na', 'n.a.', 'no data', 'nodata', 'null', '—', '–']);

export function isNoDataToken(raw: string): boolean {
  return NO_DATA_TOKENS.has(raw.trim().toLowerCase());
}

export type CellStatus = 'value' | 'no-data' | 'unparsable';

/** A report cell that carried a measurement, or explicitly did not. */
export interface MeasurementCell {
  /** The vendor key/column header this came from, verbatim. */
  key: string;
  status: CellStatus;
  /** The cell exactly as the provider rendered it, for diagnosis. */
  raw: string;
  /** Present only when `status === 'value'`. Already converted to the spec's canonical unit. */
  value?: number;
  /** The unit token the provider wrote, when it wrote one. Absent for a bare number. */
  unit?: string;
}

/** A money cell. Currency is reported, never inferred -- see readMoney. */
export interface MoneyCell {
  key: string;
  status: CellStatus;
  raw: string;
  amount?: number;
  /** Set only from an explicit three-letter code (e.g. "USD"). Never derived from a symbol. */
  currencyCode?: string;
  /** The symbol the provider wrote, verbatim. "$" is not a currency -- it is shared by a dozen of them. */
  currencySymbol?: string;
}

/**
 * The units a field will accept, and how each converts onto the field's
 * canonical unit.
 *
 * `''` is listed explicitly wherever a bare number is acceptable, so
 * "this field tolerates a unitless cell" is a decision visible in the
 * table rather than a fallthrough in the parser.
 */
export interface UnitSpec {
  canonical: string;
  factors: Readonly<Record<string, number>>;
}

/**
 * Distance and odometer, canonical km.
 *
 * A bare `m` is deliberately NOT accepted. Metres would be a factor of
 * 1000, miles a factor of 1.609344, and a deployment writing "34853 m"
 * cannot be told from one writing a sloppy abbreviation for miles. A
 * 1000x error in an odometer is not a rounding problem -- it is a
 * maintenance schedule and a depreciation charge -- so the ambiguous
 * token is refused and reported instead.
 */
export const DISTANCE_UNITS: UnitSpec = {
  canonical: 'km',
  factors: {
    '': 1,
    km: 1,
    kms: 1,
    kilometer: 1,
    kilometers: 1,
    kilometre: 1,
    kilometres: 1,
    mi: 1.609344,
    mile: 1.609344,
    miles: 1.609344,
  },
};

/** Fuel volume, canonical litres. Gallons are refused: US and imperial differ by 20% and the cell does not say which. */
export const VOLUME_UNITS: UnitSpec = {
  canonical: 'L',
  factors: {
    '': 1,
    l: 1,
    ltr: 1,
    ltrs: 1,
    liter: 1,
    liters: 1,
    litre: 1,
    litres: 1,
  },
};

/**
 * Fuel consumption, canonical L/100km.
 *
 * `l/h` is NOT here, and its absence is the point: an hourly burn rate
 * and a per-distance rate are different quantities, and accepting one
 * where the other is expected is how a stationary idling truck comes to
 * report excellent fuel economy.
 */
export const CONSUMPTION_PER_100KM_UNITS: UnitSpec = {
  canonical: 'L/100km',
  factors: {
    '': 1,
    '/100km': 1,
    'l/100km': 1,
    'ltr/100km': 1,
    'liter/100km': 1,
    'liters/100km': 1,
    'litre/100km': 1,
    'litres/100km': 1,
  },
};

/** A count of events. Unitless by definition; anything with a suffix is not a count. */
export const COUNT_UNITS: UnitSpec = { canonical: '', factors: { '': 1 } };

/**
 * Strict thousands grouping. A comma anywhere else makes the cell
 * unparsable rather than guessed: "1,5" is one-and-a-half in most of
 * continental Europe and fifteen with a stray separator elsewhere, and
 * a fuel report is not the place to pick one.
 */
const THOUSANDS_GROUPED = /^[+-]?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/;
const PLAIN_NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)$/;

/** A finite number, or null when the text is not unambiguously one. */
export function parseCellNumber(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  let numeric = trimmed;
  if (numeric.includes(',')) {
    if (!THOUSANDS_GROUPED.test(numeric)) return null;
    numeric = numeric.replace(/,/g, '');
  }
  if (!PLAIN_NUMBER.test(numeric)) return null;

  const value = Number(numeric);
  return Number.isFinite(value) ? value : null;
}

/** Folds a unit token the same way normaliseKey folds a field name: case and separators only. */
export function normaliseUnit(unit: string): string {
  return unit.toLowerCase().replace(/[\s.]/g, '');
}

/** Splits "34,853.05 km" into its numeric text and its unit token. */
function splitNumberAndUnit(raw: string): { numeric: string; unit: string } | null {
  const match = raw.trim().match(/^([+-]?[\d,]*\.?[\d,]*\d)\s*(.*)$/);
  if (!match) return null;
  return { numeric: match[1], unit: match[2].trim() };
}

/**
 * Interprets one already-located cell against a unit spec.
 *
 * Exported because the `Fuel` summary column carries values that never
 * appear under a key of their own -- see parseFuelSummary, which reuses
 * exactly this logic so a unit rule cannot diverge between a column and
 * a summary label.
 */
export function interpretMeasurement(key: string, raw: unknown, spec: UnitSpec): MeasurementCell {
  // A boolean coerces to 0/1 and would become a reading of one litre.
  if (typeof raw === 'boolean') return { key, status: 'unparsable', raw: String(raw) };

  if (typeof raw === 'number') {
    return Number.isFinite(raw)
      ? { key, status: 'value', raw: String(raw), value: raw }
      : { key, status: 'unparsable', raw: String(raw) };
  }

  if (typeof raw !== 'string') {
    // An object or array in a numeric cell is malformed, not empty.
    return { key, status: 'unparsable', raw: describeNonScalar(raw) };
  }

  const text = raw.trim();
  if (!text) return { key, status: 'unparsable', raw: text };
  if (isNoDataToken(text)) return { key, status: 'no-data', raw: text };

  const split = splitNumberAndUnit(text);
  if (!split) return { key, status: 'unparsable', raw: text };

  const numeric = parseCellNumber(split.numeric);
  if (numeric === null) return { key, status: 'unparsable', raw: text };

  const factor = spec.factors[normaliseUnit(split.unit)];
  if (factor === undefined) return { key, status: 'unparsable', raw: text };

  return {
    key,
    status: 'value',
    raw: text,
    // Exact for factor 1 (the overwhelming case). Converted values are
    // rounded to 6 dp purely to keep binary-float dust out of a figure
    // an operator will read -- 1.609344 * 3 is not 4.828032 in IEEE 754.
    value: factor === 1 ? numeric : Number((numeric * factor).toFixed(6)),
    ...(split.unit ? { unit: split.unit } : {}),
  };
}

function describeNonScalar(raw: unknown): string {
  return Array.isArray(raw) ? '[array]' : raw === null ? 'null' : '[object]';
}

/**
 * A measurement under the first alias present on the row, or null when
 * no alias matched at all.
 *
 * Null means "we never found the field"; a returned cell with status
 * 'no-data' means "we found it and the provider says it has none". Those
 * reach the caller as separate outcomes on purpose.
 */
export function readMeasurement(
  index: Map<string, { key: string; value: unknown }>,
  aliases: readonly string[],
  spec: UnitSpec
): MeasurementCell | null {
  const hit = pickRaw(index, aliases);
  if (!hit) return null;
  return interpretMeasurement(hit.key, hit.value, spec);
}

/**
 * A monetary amount, with whatever currency marking the provider wrote.
 *
 * The currency is NEVER inferred. A three-letter alphabetic token is
 * taken as a code; anything else is preserved verbatim as a symbol and
 * left uninterpreted, because "$" is shared by a dozen currencies and
 * this platform is sold into a market where the local one and USD
 * circulate side by side. Guessing here would let two different
 * currencies be summed into one total -- the failure the finance
 * module's mixedReportingCurrencies refusal already exists to prevent.
 */
export function readMoney(
  index: Map<string, { key: string; value: unknown }>,
  aliases: readonly string[]
): MoneyCell | null {
  const hit = pickRaw(index, aliases);
  if (!hit) return null;

  const { key, value } = hit;

  if (typeof value === 'boolean') return { key, status: 'unparsable', raw: String(value) };
  if (typeof value === 'number') {
    return Number.isFinite(value)
      ? { key, status: 'value', raw: String(value), amount: value }
      : { key, status: 'unparsable', raw: String(value) };
  }
  if (typeof value !== 'string') return { key, status: 'unparsable', raw: describeNonScalar(value) };

  const text = value.trim();
  if (!text) return { key, status: 'unparsable', raw: text };
  if (isNoDataToken(text)) return { key, status: 'no-data', raw: text };

  const match = text.match(/^([^\d+-]*?)\s*([+-]?[\d,]*\.?[\d,]*\d)\s*(.*)$/);
  if (!match) return { key, status: 'unparsable', raw: text };

  const amount = parseCellNumber(match[2]);
  if (amount === null) return { key, status: 'unparsable', raw: text };

  const cell: MoneyCell = { key, status: 'value', raw: text, amount };
  for (const token of [match[1].trim(), match[3].trim()]) {
    if (!token) continue;
    if (/^[A-Za-z]{3}$/.test(token)) cell.currencyCode = token.toUpperCase();
    else if (!cell.currencySymbol) cell.currencySymbol = token;
  }

  return cell;
}

// ─── The `Fuel` summary column ───────────────────────────────────────
//
// One cell, five figures, rendered for a human:
//
//   "Fuel Filling Times: 0; Fuel Filling: 0 ; Fuel Leakage Times: 0;
//    Fuel Leakage: 0 ; Fuel Consumption: 0 /100km"
//
// Parsed as label/value pairs and then read through the same alias
// discipline as a column, because the labels are as unconfirmed as the
// column headers were. Labels are matched EXACTLY (after folding), not
// by prefix: "Fuel Filling Times" and "Fuel Filling" differ only by a
// suffix, and prefix matching would read the count as the volume.

/** Aliases for each figure inside the summary. Ordered most-likely first, same as the column aliases. */
const SUMMARY_ALIASES = {
  refuelEventCount: ['Fuel Filling Times', 'Filling Times', 'Refuel Times', 'Refuelling Times', 'Fuel Fill Times'],
  refuelledLitres: ['Fuel Filling', 'Filling', 'Refuel', 'Refuelling', 'Fuel Fill', 'Fuel Filled'],
  drainEventCount: ['Fuel Leakage Times', 'Leakage Times', 'Fuel Theft Times', 'Fuel Drop Times', 'Drain Times'],
  drainedLitres: ['Fuel Leakage', 'Leakage', 'Fuel Theft', 'Fuel Drop', 'Drain', 'Drained'],
  consumptionPer100Km: ['Fuel Consumption', 'Consumption', 'Average Fuel Consumption', 'Avg Consumption', 'Average Consumption'],
} as const;

const SUMMARY_SPECS: Record<keyof typeof SUMMARY_ALIASES, UnitSpec> = {
  refuelEventCount: COUNT_UNITS,
  refuelledLitres: VOLUME_UNITS,
  drainEventCount: COUNT_UNITS,
  drainedLitres: VOLUME_UNITS,
  consumptionPer100Km: CONSUMPTION_PER_100KM_UNITS,
};

export interface FuelSummary {
  refuelEventCount?: MeasurementCell;
  refuelledLitres?: MeasurementCell;
  drainEventCount?: MeasurementCell;
  drainedLitres?: MeasurementCell;
  consumptionPer100Km?: MeasurementCell;
  /** Labels inside the summary that no alias claimed. The correction surface, exactly as `unmappedFields` is for columns. */
  unmappedLabels: string[];
}

/** Labels are split on the FIRST colon only; a value may legitimately contain one. Full-width colon included for this platform family's CJK builds. */
const SUMMARY_ENTRY_SEPARATOR = /[;\n\r]+/;
const SUMMARY_LABEL_SEPARATOR = /[:：]/;

export function parseFuelSummary(raw: unknown): FuelSummary | null {
  if (typeof raw !== 'string') return null;

  const text = raw.trim();
  if (!text || isNoDataToken(text)) return null;

  const entries = new Map<string, { label: string; value: string }>();
  for (const chunk of text.split(SUMMARY_ENTRY_SEPARATOR)) {
    const piece = chunk.trim();
    if (!piece) continue;

    const at = piece.search(SUMMARY_LABEL_SEPARATOR);
    if (at < 0) {
      // A fragment with no label at all. Reported rather than dropped:
      // it is evidence the delimiter assumption is wrong on this
      // deployment, which is precisely what unmappedLabels is for.
      if (!entries.has(normaliseKey(piece))) entries.set(normaliseKey(piece), { label: piece, value: '' });
      continue;
    }

    const label = piece.slice(0, at).trim();
    const value = piece.slice(at + 1).trim();
    if (!label) continue;

    const key = normaliseKey(label);
    if (!entries.has(key)) entries.set(key, { label, value });
  }

  if (entries.size === 0) return null;

  const summary: FuelSummary = { unmappedLabels: [] };
  const claimed = new Set<string>();

  for (const field of Object.keys(SUMMARY_ALIASES) as Array<keyof typeof SUMMARY_ALIASES>) {
    for (const alias of SUMMARY_ALIASES[field]) {
      const normalised = normaliseKey(alias);
      const entry = entries.get(normalised);
      if (!entry || claimed.has(normalised)) continue;

      claimed.add(normalised);
      summary[field] = interpretMeasurement(entry.label, entry.value, SUMMARY_SPECS[field]);
      break;
    }
  }

  summary.unmappedLabels = Array.from(entries.entries())
    .filter(([key]) => !claimed.has(key))
    .map(([, entry]) => entry.label)
    .sort();

  return summary;
}

/**
 * Convenience for callers that hold a row rather than an index. Kept
 * here so the summary column's own alias list lives beside the label
 * aliases it feeds.
 */
export function readFuelSummaryFromRow(row: VendorRow, key: string): FuelSummary | null {
  return parseFuelSummary(row[key]);
}
