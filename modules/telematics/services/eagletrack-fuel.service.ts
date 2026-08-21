// modules/telematics/services/eagletrack-fuel.service.ts
//
// GET /api2/reports/fuel for one vehicle over one window, mapped onto
// the fuel vocabulary this product already uses.
//
// ---------------------------------------------------------------------
// NOTHING HERE IS DERIVED
// ---------------------------------------------------------------------
// Every figure returned is a value the provider actually sent and a
// candidate alias matched. In particular `fuelConsumedLitres` is NEVER
// computed as initial-minus-final: those two readings can come from
// different sensors on different scales (this platform reports fuel from
// a float sender, a CAN bus, and up to five separate tank sensors -- see
// FUEL_LEVEL_LITRE_CODES), and subtracting across them would be our
// arithmetic presented to an operator as the provider's measurement. The
// same rule blocks end-odometer-minus-start-odometer standing in for a
// missing distance.
//
// A field the provider did not send is ABSENT, never 0. That is the same
// rule the `?? 0` removal established for live telemetry, and it matters
// more here: a fuel report showing "0 L consumed" reads as a vehicle
// that did not move, while "No data" reads as a device that does not
// report fuel. Those are opposite operational conclusions.
//
// ---------------------------------------------------------------------
// THE PAYLOAD IS A RENDERED TABLE
// ---------------------------------------------------------------------
// /api2/reports/fuel does not return records. It returns
// `{ column: [...], body: [[...]], global: {...} }` -- a header and
// positional rows of DISPLAY STRINGS ("7.14 km", "-", and a whole
// semicolon-delimited sentence in the `Fuel` column). See
// eagletrack-report-values.ts for how a cell is read and
// eagletrack-field-map.ts's readColumnarPayload for how the table is
// expanded into rows the alias tables can already handle.
//
// ---------------------------------------------------------------------
// WHICH ROWS ARE ACTUALLY THIS VEHICLE'S
// ---------------------------------------------------------------------
// A report row carries no uin. Its only identifier is the `Name` column,
// which holds the tracker's name -- and the request was made for ONE
// tracker, so ordinarily every row is ours and the name is redundant.
//
// The case that matters is the other one. A deployment that ignores the
// `uin` filter and answers with the whole account's report would, if
// rows were attributed by the requested uin alone, write every other
// vehicle's distance and fuel spend into this vehicle's report -- across
// org units, and in a tenant where several branches share one Eagle
// Track account. That is the same misattribution class the adapter's
// matching rules exist to prevent ("a wrong match is worse than no
// match"), reached through the report endpoint instead of the roster.
//
// So attribution is decided on evidence, in three cases:
//
//   * ONE distinct name in the payload -> the filter was honoured; keep
//     every row. Whether that name equals our plate is reported
//     (`provider-name-differs-from-plate`) but does not gate anything:
//     a tracker legitimately named "DashCam2" must not lose its report.
//   * SEVERAL distinct names, some equal to our plate -> the filter was
//     NOT honoured. Keep only the rows that match, and say how many were
//     set aside and whose they were.
//   * SEVERAL distinct names, none equal to our plate -> we cannot tell
//     which tracker is ours. Keep nothing and say so. An empty report
//     with a stated reason is recoverable; a plausible report built from
//     another vehicle's fuel is not.
//
// Comparison uses trim + upper-case, which is exactly what
// findByLicensePlate matches on -- canonicalisation, not a new
// heuristic. No substring search, no similarity scoring.
//
// ---------------------------------------------------------------------
// IDEMPOTENCE
// ---------------------------------------------------------------------
// This is a pure read. It resolves a vehicle, calls the provider and
// maps the response; it writes nothing, ingests nothing and enqueues
// nothing, so N identical calls leave the system exactly as one call
// does. That is deliberate rather than incidental -- the history
// endpoint DOES ingest, and it needed a bulkWrite/$setOnInsert design to
// be safely repeatable. A fuel report needs no such machinery because it
// stores nothing, and it should stay that way: the moment this posts to
// the fuel log or the allocation ledger it needs a deterministic
// sourceId first, the way the depreciation posting does.

import { monitoring } from '@/infrastructure/monitoring/logger';
import { TenantContext } from '@/modules/tenancy/services/tenant-context.service';
import { eagletrackAdapter } from '../adapters/eagletrack/eagletrack.adapter';
import { clampRange, EagleTrackRangeQuery } from '../adapters/eagletrack/eagletrack-date-range';
import {
  EagleTrackFuelReportPayload,
  parseFuelReportPayload,
} from '../adapters/eagletrack/eagletrack-payload.parsers';
import { EagleTrackFuelReportRow } from '../adapters/eagletrack/eagletrack.types';
import { telematicsRepository } from '../repositories/telematics.repository';
import { TelematicsData } from '../types/telematics.types';
import { assertVehicleInScope } from './telematics-scope.utils';

/** Longest fuel-report window a caller may request. A period report is an aggregate; a year of them in one call is a different feature. */
export const MAX_FUEL_REPORT_SPAN_MS = 92 * 24 * 60 * 60_000;

/** How many provider names a warning will name before it stops listing them. A response is not a log file. */
const MAX_REPORTED_FOREIGN_NAMES = 10;

/**
 * A machine-readable statement about the provider's answer.
 *
 * A `code` rather than prose because the UI renders these and future
 * callers will branch on them; `detail` carries the specifics for a
 * human. Warnings never replace data -- a warned report still returns
 * every row it kept.
 */
export type EagleTrackFuelWarningCode =
  /** The report named trackers other than this vehicle. Their rows were excluded. */
  | 'rows-excluded-for-other-trackers'
  /** The report named trackers, none of them this vehicle. Nothing could be attributed. */
  | 'no-row-matches-vehicle'
  /** The provider's own record counter exceeds the rows it returned -- the totals may be a slice. */
  | 'record-count-exceeds-returned-rows'
  /** A body row's cell count differed from the header's. Positional mapping may have shifted. */
  | 'row-width-mismatch'
  /** The header repeated a label. The first occurrence won; the rest are in `unmappedFields`. */
  | 'duplicate-columns'
  /** The single tracker in the report is named something other than this vehicle's plate. Informational. */
  | 'provider-name-differs-from-plate'
  /** Rows carried fuel costs in more than one currency, so no total is offered. */
  | 'mixed-fuel-cost-currencies'
  /** At least one row's figures contradict each other. See EagleTrackFuelRowFlag. */
  | 'row-consistency-flags';

export interface EagleTrackFuelWarning {
  code: EagleTrackFuelWarningCode;
  detail: string;
}

/** A period total for fuel spend, offered only when every contributing row agreed on the currency. */
export interface EagleTrackFuelCostTotal {
  amount: number;
  currencyCode?: string;
  currencySymbol?: string;
}

export interface EagleTrackFuelReport {
  vehicleId: string;
  licensePlate: string;
  uin: string | null;
  /** Rows attributed to THIS vehicle. See the header for how that is decided. */
  rows: EagleTrackFuelReportRow[];
  /**
   * The subset of the report that maps onto TelematicsData.fuel,
   * totalled across rows. Members are present only when at least one row
   * carried them.
   */
  canonicalFuel: Pick<TelematicsData['fuel'], 'fuelUsed' | 'consumptionRate'>;
  /** Period fuel spend, when the rows carried a cost in one currency. Absent otherwise -- never a mixed-currency sum. */
  fuelCostTotal?: EagleTrackFuelCostTotal;
  /** Vendor keys no candidate alias claimed, deduplicated across rows. The correction list. */
  unmappedFields: string[];
  /** Labels inside the `Fuel` summary cell no alias claimed. The correction list for that column. */
  unmappedFuelSummaryLabels: string[];
  /** Canonical fields the provider explicitly reported as "no data" on at least one row. Definitive, unlike an absence. */
  noDataFields: string[];
  /** Canonical fields present but unreadable on at least one row. Always a unit/alias bug to fix, never a data gap. */
  unparsableFields: string[];
  /** The provider's header row, verbatim. Empty for a non-columnar payload. */
  providerColumns: string[];
  /** The provider's own counters. `recordCount` above the rows returned is why `record-count-exceeds-returned-rows` exists. */
  providerCounters: { pageCount: number | null; recordCount: number | null };
  /** Rows the report contained that belong to other trackers. Never included in the totals. */
  excludedRowCount: number;
  providerWarnings: EagleTrackFuelWarning[];
  providerQuery: EagleTrackRangeQuery | null;
  /** Present when the vendor could not be reached. `rows` is then empty rather than wrong. */
  providerError?: string;
}

/** trim + upper-case: exactly what findByLicensePlate matches on. Canonicalisation, not fuzzy matching. */
function foldPlate(value: string): string {
  return value.trim().toUpperCase();
}

export class EagleTrackFuelService {
  async getFuelReport(
    vehicleId: string,
    context: TenantContext,
    requested: { from: Date; to: Date }
  ): Promise<EagleTrackFuelReport> {
    const vehicle = await assertVehicleInScope(vehicleId, context);
    const { from, to } = clampRange(requested.from, requested.to, MAX_FUEL_REPORT_SPAN_MS);
    const uin = await telematicsRepository.getEagleTrackUinForVehicle(
      vehicle.vehicleId,
      context.organizationId
    );

    const report: EagleTrackFuelReport = {
      vehicleId: vehicle.vehicleId,
      licensePlate: vehicle.licensePlate,
      uin,
      rows: [],
      canonicalFuel: {},
      unmappedFields: [],
      unmappedFuelSummaryLabels: [],
      noDataFields: [],
      unparsableFields: [],
      providerColumns: [],
      providerCounters: { pageCount: null, recordCount: null },
      excludedRowCount: 0,
      providerWarnings: [],
      providerQuery: null,
    };

    if (!uin) return report;

    const client = await eagletrackAdapter.buildClientFor(context.organizationId);
    if (!client) {
      report.providerError = 'Eagle Track is not configured or not enabled for this organization.';
      return report;
    }

    let payload: EagleTrackFuelReportPayload;
    try {
      const response = await client.getFuelReport({ uin, from, to });
      report.providerQuery = response.range;
      payload = parseFuelReportPayload(response.rows, uin);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown Eagle Track API error';
      report.providerError = message;
      monitoring.logWarn('[EagleTrackFuelService] Fuel report fetch failed', {
        tenantId: context.organizationId,
        vehicleId: vehicle.vehicleId,
        error: message,
      });
      return report;
    }

    report.providerColumns = payload.columns;
    report.providerCounters = payload.counters;

    const attributed = attributeRows(payload.rows, vehicle.licensePlate);
    report.rows = attributed.rows;
    report.excludedRowCount = attributed.excluded;
    report.providerWarnings.push(...attributed.warnings);
    report.providerWarnings.push(...describePayloadIssues(payload, attributed.rows.length));

    report.canonicalFuel = summariseCanonicalFuel(attributed.rows);
    const cost = summariseFuelCost(attributed.rows);
    if (cost.total) report.fuelCostTotal = cost.total;
    if (cost.warning) report.providerWarnings.push(cost.warning);

    report.unmappedFields = dedupeSorted(attributed.rows.flatMap((row) => row.unmappedFields));
    report.unmappedFuelSummaryLabels = dedupeSorted(
      attributed.rows.flatMap((row) => row.unmappedFuelSummaryLabels)
    );
    report.noDataFields = dedupeSorted(attributed.rows.flatMap((row) => row.noDataFields));
    report.unparsableFields = dedupeSorted(attributed.rows.flatMap((row) => row.unparsableFields));

    const flagged = attributed.rows.filter((row) => row.flags.length > 0);
    if (flagged.length > 0) {
      report.providerWarnings.push({
        code: 'row-consistency-flags',
        detail: `${flagged.length} of ${attributed.rows.length} row(s) carry figures that contradict each other: ${dedupeSorted(
          flagged.flatMap((row) => row.flags)
        ).join(', ')}.`,
      });
    }

    return report;
  }
}

/**
 * Decides which of the provider's rows are this vehicle's. See the file
 * header for the three cases and why the ambiguous one keeps nothing.
 */
export function attributeRows(
  rows: EagleTrackFuelReportRow[],
  licensePlate: string
): { rows: EagleTrackFuelReportRow[]; excluded: number; warnings: EagleTrackFuelWarning[] } {
  const named = rows.filter((row) => row.providerName);
  const distinct = Array.from(new Set(named.map((row) => foldPlate(row.providerName as string))));

  // No row identifies a tracker at all: nothing contradicts the
  // single-tracker request, so every row is ours.
  if (distinct.length === 0) return { rows, excluded: 0, warnings: [] };

  const plate = foldPlate(licensePlate);

  if (distinct.length === 1) {
    if (distinct[0] === plate) return { rows, excluded: 0, warnings: [] };

    // One tracker, differently named. Trackers are legitimately named
    // things that are not plates on other deployments, and the request
    // was already scoped to one uin, so this reports rather than
    // withholds.
    return {
      rows,
      excluded: 0,
      warnings: [
        {
          code: 'provider-name-differs-from-plate',
          detail: `The report identifies this tracker as "${named[0].providerName}", which is not this vehicle's plate (${licensePlate}). Rows were kept because the report named only one tracker.`,
        },
      ],
    };
  }

  // More than one tracker in a single-tracker report: the uin filter was
  // not honoured, so attribution now has to be earned per row.
  const mine = rows.filter((row) => row.providerName && foldPlate(row.providerName) === plate);
  const foreign = distinct.filter((name) => name !== plate);
  const listed = foreign.slice(0, MAX_REPORTED_FOREIGN_NAMES).join(', ');
  const suffix =
    foreign.length > MAX_REPORTED_FOREIGN_NAMES ? `, +${foreign.length - MAX_REPORTED_FOREIGN_NAMES} more` : '';

  if (mine.length === 0) {
    return {
      rows: [],
      excluded: rows.length,
      warnings: [
        {
          code: 'no-row-matches-vehicle',
          detail: `The provider returned ${rows.length} row(s) for ${foreign.length} other tracker(s) (${listed}${suffix}) and none for ${licensePlate}. Nothing could be attributed to this vehicle.`,
        },
      ],
    };
  }

  return {
    rows: mine,
    excluded: rows.length - mine.length,
    warnings: [
      {
        code: 'rows-excluded-for-other-trackers',
        detail: `The provider ignored the tracker filter and returned rows for ${foreign.length} other tracker(s) (${listed}${suffix}). ${rows.length - mine.length} row(s) were excluded from this report.`,
      },
    ],
  };
}

/**
 * Warnings about the TABLE rather than about attribution.
 *
 * `record-count-exceeds-returned-rows` is the one that matters. The live
 * response reported `recCount: "1318"` next to a single body row, and
 * there are two readings: the report is paginated and these totals are a
 * slice, or `recCount` counts underlying position records rather than
 * report rows. One sample cannot settle it, and neither can be assumed:
 * silently paginating would multiply every request against a deployment
 * where the counter means the second thing, and silently ignoring it
 * would present a fraction of a period as the period. So both numbers
 * are returned and the ambiguity is stated. Resolving it takes one curl
 * with `pageSize`/`pageIndex` -- see the changelog.
 */
function describePayloadIssues(
  payload: EagleTrackFuelReportPayload,
  keptRows: number
): EagleTrackFuelWarning[] {
  const warnings: EagleTrackFuelWarning[] = [];

  if (payload.rowsWithUnexpectedWidth > 0) {
    warnings.push({
      code: 'row-width-mismatch',
      detail: `${payload.rowsWithUnexpectedWidth} row(s) did not have one cell per column (${payload.columns.length} columns). Values are mapped by position, so figures on those rows may be attributed to the wrong field.`,
    });
  }

  if (payload.duplicateColumns.length > 0) {
    warnings.push({
      code: 'duplicate-columns',
      detail: `The provider's header repeats: ${dedupeSorted(payload.duplicateColumns).join(', ')}. The first occurrence was used; the rest appear in unmappedFields.`,
    });
  }

  const { recordCount } = payload.counters;
  if (recordCount !== null && keptRows > 0 && recordCount > payload.rows.length) {
    warnings.push({
      code: 'record-count-exceeds-returned-rows',
      detail: `The provider reported ${recordCount} record(s) but returned ${payload.rows.length} row(s). If this report is paginated, the totals cover only the rows returned.`,
    });
  }

  return warnings;
}

/**
 * Totals the two report figures that have a TelematicsData counterpart.
 *
 * `fuelUsed` SUMS across rows -- consumption over consecutive periods is
 * additive, so a week of daily rows totals to the week.
 *
 * `consumptionRate` (L/100km) does NOT sum, and is not averaged either.
 * A plain mean over period rows is wrong whenever the periods cover
 * different distances -- a 5 km row at 30 L/100km and a 500 km row at
 * 9 L/100km do not average to 19.5. It is therefore derived from the
 * TOTALS when, and only when, both totals are present:
 * (total litres / total km) * 100. That is not inventing a figure -- it
 * is the definition of the unit, computed from two values the provider
 * did send. When either total is missing, the field is omitted.
 *
 * A single row that carries its own rate and nothing else is passed
 * through unchanged, since there is nothing to reconcile it against --
 * UNLESS the row is flagged `zero-consumption-rate-without-fuel-used`.
 * The live sample is exactly that row: `Fuel Used` and `Fuel Cost` both
 * "-", and `Fuel Consumption: 0 /100km` inside the summary. A vehicle
 * that covered 7.14 km did not do it on precisely zero litres; that 0 is
 * what the vendor renders when there is no fuel sensor to report from.
 * Promoting it would put "0.0 L/100km" in front of an operator as this
 * vehicle's economy -- the most flattering wrong number the dataset can
 * produce, and the one a fuel-efficiency review would act on. The value
 * stays on the row, where its flag sits next to it; it just does not
 * become the headline.
 */
export function summariseCanonicalFuel(
  rows: EagleTrackFuelReportRow[]
): Pick<TelematicsData['fuel'], 'fuelUsed' | 'consumptionRate'> {
  const out: Pick<TelematicsData['fuel'], 'fuelUsed' | 'consumptionRate'> = {};

  const litres = rows.reduce<number | undefined>(
    (sum, row) => (typeof row.fuelConsumedLitres === 'number' ? (sum ?? 0) + row.fuelConsumedLitres : sum),
    undefined
  );
  const km = rows.reduce<number | undefined>(
    (sum, row) => (typeof row.distanceKm === 'number' ? (sum ?? 0) + row.distanceKm : sum),
    undefined
  );

  if (litres !== undefined) out.fuelUsed = litres;

  if (litres !== undefined && km !== undefined && km > 0) {
    out.consumptionRate = (litres / km) * 100;
  } else if (
    rows.length === 1 &&
    typeof rows[0].consumptionPer100Km === 'number' &&
    !rows[0].flags.includes('zero-consumption-rate-without-fuel-used')
  ) {
    out.consumptionRate = rows[0].consumptionPer100Km;
  }

  return out;
}

/**
 * Totals fuel spend, refusing to add across currencies.
 *
 * The same refusal the finance module makes with
 * mixedReportingCurrencies, and for the same reason: this platform sells
 * into a market where the local currency and USD circulate side by side,
 * so a sum across them is not a number that means anything. A symbol is
 * not a currency either -- "$" is shared by a dozen of them -- so rows
 * are grouped on whatever marking the provider actually wrote, and
 * unmarked amounts form their own group rather than being assumed to
 * match a marked one.
 */
export function summariseFuelCost(rows: EagleTrackFuelReportRow[]): {
  total?: EagleTrackFuelCostTotal;
  warning?: EagleTrackFuelWarning;
} {
  const priced = rows.filter((row) => typeof row.fuelCost === 'number');
  if (priced.length === 0) return {};

  const markings = new Set(
    priced.map((row) => `${row.fuelCostCurrencyCode ?? ''}|${row.fuelCostCurrencySymbol ?? ''}`)
  );

  if (markings.size > 1) {
    return {
      warning: {
        code: 'mixed-fuel-cost-currencies',
        detail: `Fuel costs arrived under ${markings.size} different currency markings, so no total is offered. Per-row amounts are unchanged.`,
      },
    };
  }

  const first = priced[0];
  return {
    total: {
      amount: priced.reduce((sum, row) => sum + (row.fuelCost as number), 0),
      ...(first.fuelCostCurrencyCode ? { currencyCode: first.fuelCostCurrencyCode } : {}),
      ...(first.fuelCostCurrencySymbol ? { currencySymbol: first.fuelCostCurrencySymbol } : {}),
    },
  };
}

function dedupeSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort();
}

export const eagletrackFuelService = new EagleTrackFuelService();
