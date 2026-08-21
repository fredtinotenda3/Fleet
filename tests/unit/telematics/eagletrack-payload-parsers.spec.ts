// tests/unit/telematics/eagletrack-payload-parsers.spec.ts
//
// The four Eagle Track payloads whose field names are NOT confirmed
// against a live deployment are read through candidate aliases. These
// tests pin the two properties that make that approach safe rather than
// merely defensive:
//
//   1. A field no candidate matched is ABSENT -- never 0, never ''.
//   2. Every unmatched vendor key is REPORTED, so a wrong guess surfaces
//      as a named key in the API response instead of as a silent
//      permanent absence.
//
// Pure functions, so no Mongo and no fetch.

import {
  buildVendorAlertKey,
  parseDriverRows,
  parseFuelReportPayload,
  parseFuelReportRows,
  parseTriggerPoints,
  parseTriggerRows,
  parseVendorAlertRows,
} from '../../../modules/telematics/adapters/eagletrack/eagletrack-payload.parsers';
import {
  clampRange,
  encodeEagleTrackDateRange,
  formatEagleTrackTimestamp,
} from '../../../modules/telematics/adapters/eagletrack/eagletrack-date-range';
import { describeTriggerType, triggerSeverity } from '../../../modules/telematics/adapters/eagletrack/eagletrack-triggers.map';
import {
  summariseCanonicalFuel,
  summariseFuelCost,
} from '../../../modules/telematics/services/eagletrack-fuel.service';
import type { EagleTrackFuelReportRow } from '../../../modules/telematics/adapters/eagletrack/eagletrack.types';

describe('Eagle Track date range', () => {
  it('formats in UTC, matching how parseEagleTrackDate reads timestamps back', () => {
    expect(formatEagleTrackTimestamp(new Date('2026-03-09T07:05:04Z'))).toBe('2026-03-09 07:05:04');
  });

  it('joins the window with the encoding-specific separator', () => {
    const from = new Date('2026-03-09T00:00:00Z');
    const to = new Date('2026-03-10T00:00:00Z');
    expect(encodeEagleTrackDateRange(from, to, 'pipe')).toContain('|');
    expect(encodeEagleTrackDateRange(from, to, 'comma')).toContain(',');
    expect(encodeEagleTrackDateRange(from, to, 'underscore')).toContain('_');
  });

  it('keeps the END of an over-wide window, not the start', () => {
    // A caller asking for "the last year" wants the recent end of it.
    // Truncating the other way returns the oldest slice, which looks
    // like a broken integration rather than a capped one.
    const from = new Date('2020-01-01T00:00:00Z');
    const to = new Date('2026-01-01T00:00:00Z');
    const clamped = clampRange(from, to, 24 * 60 * 60_000);
    expect(clamped.to).toEqual(to);
    expect(clamped.from.toISOString()).toBe('2025-12-31T00:00:00.000Z');
  });

  it('refuses an inverted window rather than silently swapping it', () => {
    expect(() =>
      clampRange(new Date('2026-03-10T00:00:00Z'), new Date('2026-03-09T00:00:00Z'), 60_000)
    ).toThrow(/must not be after/);
  });
});

describe('fuel report parsing', () => {
  it('maps values under any documented spelling and reports what it could not place', () => {
    const rows = parseFuelReportRows(
      [{ fuel_consumption: 42.5, distance: 310, mystery_column: 7 }],
      '861234567890123'
    );

    expect(rows[0].fuelConsumedLitres).toBe(42.5);
    expect(rows[0].distanceKm).toBe(310);
    // The correction surface: one real request turns this into a
    // one-line alias addition.
    expect(rows[0].unmappedFields).toContain('mystery_column');
  });

  it('leaves an unreported figure ABSENT rather than 0', () => {
    const rows = parseFuelReportRows([{ distance: 10 }], 'uin-1');
    // "0 L consumed" reads as a vehicle that did not move; absent reads
    // as a device that does not report fuel. Opposite conclusions.
    expect(rows[0].fuelConsumedLitres).toBeUndefined();
    expect('fuelConsumedLitres' in rows[0]).toBe(false);
  });

  it('falls back to the requested uin only when the row carries none', () => {
    expect(parseFuelReportRows([{ distance: 1 }], 'fallback')[0].uin).toBe('fallback');
    expect(parseFuelReportRows([{ uin: 'own', distance: 1 }], 'fallback')[0].uin).toBe('own');
  });

  it('never derives consumption from initial minus final', () => {
    // Those two readings can come from different sensors on different
    // scales; subtracting across them would be our arithmetic presented
    // as the provider's measurement.
    const rows = parseFuelReportRows([{ startFuel: 80, endFuel: 30 }], 'uin-1');
    expect(rows[0].fuelConsumedLitres).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────
// The COLUMNAR form, verbatim from a live deployment.
//
// This is the actual /api2/reports/fuel response: a rendered table, not
// a record list. Every test below runs against this exact payload rather
// than a tidied version of it, because the tidying is where a parser
// stops being evidence of anything.
// ─────────────────────────────────────────────────────────────────────

const LIVE_FUEL_PAYLOAD = {
  column: [
    'Name',
    'From',
    'To',
    'Fuel Used',
    'Fuel Cost',
    'Fuel',
    'Distance',
    'Start Odometer',
    'End Odometer',
  ],
  body: [
    [
      'AFU0078',
      '2026-08-20 00:04:07',
      '2026-08-20 23:59:49',
      '-',
      '-',
      'Fuel Filling Times: 0; Fuel Filling: 0 ; Fuel Leakage Times: 0; Fuel Leakage: 0 ; Fuel Consumption: 0 /100km',
      '7.14 km',
      '34853.05 km',
      '34860.19 km',
    ],
  ],
  global: { pageCount: 0, recCount: '1318' },
};

describe('columnar fuel report', () => {
  it('parses the live response end to end', () => {
    const [row] = parseFuelReportRows(LIVE_FUEL_PAYLOAD, '861234567890123');

    expect(row.distanceKm).toBe(7.14);
    expect(row.startOdometerKm).toBe(34853.05);
    expect(row.endOdometerKm).toBe(34860.19);
    expect(row.periodStart).toBe('2026-08-20 00:04:07');
    expect(row.periodStartIso).toBe('2026-08-20T00:04:07.000Z');
    expect(row.periodEndIso).toBe('2026-08-20T23:59:49.000Z');
    expect(row.refuelEventCount).toBe(0);
    expect(row.drainEventCount).toBe(0);
  });

  it('claims every column the live response sends', () => {
    // An empty unmappedFields on a real payload is the proof that the
    // alias tables actually cover it. A single entry here would mean a
    // column is being silently ignored.
    expect(parseFuelReportRows(LIVE_FUEL_PAYLOAD, 'uin')[0].unmappedFields).toEqual([]);
    expect(parseFuelReportRows(LIVE_FUEL_PAYLOAD, 'uin')[0].unmappedFuelSummaryLabels).toEqual([]);
  });

  it('records "-" as NO DATA -- absent from the row, and named', () => {
    const [row] = parseFuelReportRows(LIVE_FUEL_PAYLOAD, 'uin');

    expect(row.fuelConsumedLitres).toBeUndefined();
    expect('fuelConsumedLitres' in row).toBe(false);
    expect(row.fuelCost).toBeUndefined();
    // Named, because "the provider says it has none" is a stronger
    // statement than "we could not find the column", and only the alias
    // table can fix the second.
    expect(row.noDataFields).toEqual(['fuelCost', 'fuelConsumedLitres'].sort());
    expect(row.unparsableFields).toEqual([]);
  });

  it('keeps the tracker name OUT of uin', () => {
    // A report row carries no uin. If `Name` were promoted into it, a
    // deployment that ignores the uin filter would have every other
    // vehicle's row attributed to the tracker that was asked about.
    const [row] = parseFuelReportRows(LIVE_FUEL_PAYLOAD, '861234567890123');
    expect(row.uin).toBe('861234567890123');
    expect(row.providerName).toBe('AFU0078');
  });

  it('flags a zero consumption rate on a row whose fuel-used is "-"', () => {
    // 7.14 km covered on precisely zero litres, with no fuel figure at
    // all, is a rendering placeholder rather than a measurement.
    expect(parseFuelReportRows(LIVE_FUEL_PAYLOAD, 'uin')[0].flags).toContain(
      'zero-consumption-rate-without-fuel-used'
    );
  });

  it('does not flag distance against the odometer delta when they agree', () => {
    // 34860.19 - 34853.05 = 7.14. The self-check must stay quiet here,
    // or an operator learns to ignore it.
    expect(parseFuelReportRows(LIVE_FUEL_PAYLOAD, 'uin')[0].flags).not.toContain('distance-odometer-mismatch');
  });

  it('flags a distance that contradicts the odometer delta', () => {
    // The cheapest available detector of a COLUMN SHIFT: values are
    // mapped by position, so figures that must agree no longer do.
    const shifted = {
      ...LIVE_FUEL_PAYLOAD,
      body: [
        ['AFU0078', '-', '-', '-', '-', '-', '412 km', '34853.05 km', '34860.19 km'],
      ],
    };
    expect(parseFuelReportRows(shifted, 'uin')[0].flags).toContain('distance-odometer-mismatch');
  });

  it('surfaces the provider counters instead of assuming the report is whole', () => {
    const payload = parseFuelReportPayload(LIVE_FUEL_PAYLOAD, 'uin');
    expect(payload.columnar).toBe(true);
    expect(payload.counters).toEqual({ pageCount: 0, recordCount: 1318 });
    expect(payload.columns).toHaveLength(9);
  });

  it('counts a row whose width does not match the header', () => {
    // Positional mapping plus a short row is the one failure that
    // silently shifts an odometer into a distance field.
    const ragged = { ...LIVE_FUEL_PAYLOAD, body: [['AFU0078', '2026-08-20 00:04:07']] };
    expect(parseFuelReportPayload(ragged, 'uin').rowsWithUnexpectedWidth).toBe(1);
  });

  it('no longer manufactures a row out of the `global` counter block', () => {
    // Before columnar support, toKeyedRows filtered out `column` and
    // `body` (both arrays) and kept `global` (an object) -- so the whole
    // report parsed as one row named "global" carrying pageCount and
    // recCount. A fabricated row, not an empty result.
    const rows = parseFuelReportRows(LIVE_FUEL_PAYLOAD, 'uin');
    expect(rows).toHaveLength(1);
    expect(rows.map((row) => row.uin)).not.toContain('global');
  });

  it('still reads a record-shaped payload, so other deployments are unaffected', () => {
    const rows = parseFuelReportRows([{ fuel_consumption: 42.5, distance: 310 }], 'uin');
    expect(rows[0].fuelConsumedLitres).toBe(42.5);
    expect(rows[0].distanceKm).toBe(310);
  });
});

/** A fuel row with the required bookkeeping arrays, so a test states only the figures it is about. */
function fuelRow(overrides: Partial<EagleTrackFuelReportRow> = {}): EagleTrackFuelReportRow {
  return {
    uin: 'u',
    noDataFields: [],
    unparsableFields: [],
    flags: [],
    unmappedFields: [],
    unmappedFuelSummaryLabels: [],
    raw: {},
    ...overrides,
  };
}

describe('canonical fuel summary', () => {
  it('derives L/100km from totals, not from a mean of per-row rates', () => {
    // 5 km at 30 L/100km and 500 km at 9 L/100km do NOT average to 19.5.
    const summary = summariseCanonicalFuel([
      fuelRow({ fuelConsumedLitres: 1.5, distanceKm: 5 }),
      fuelRow({ fuelConsumedLitres: 45, distanceKm: 500 }),
    ]);
    expect(summary.fuelUsed).toBeCloseTo(46.5);
    expect(summary.consumptionRate).toBeCloseTo((46.5 / 505) * 100);
  });

  it('omits the rate when distance is missing rather than dividing by zero', () => {
    const summary = summariseCanonicalFuel([fuelRow({ fuelConsumedLitres: 10 })]);
    expect(summary.fuelUsed).toBe(10);
    expect(summary.consumptionRate).toBeUndefined();
  });

  it('passes a lone row\'s own rate through when there is nothing to reconcile it against', () => {
    expect(summariseCanonicalFuel([fuelRow({ consumptionPer100Km: 9.4 })]).consumptionRate).toBe(9.4);
  });

  it('REFUSES to promote a flagged zero rate to the headline figure', () => {
    // The live sample exactly: Fuel Used "-", and "Fuel Consumption:
    // 0 /100km" inside the summary cell. Publishing that would put
    // "0.0 L/100km" in front of an operator as this vehicle's economy --
    // the most flattering wrong number the dataset can produce, and the
    // one a fuel-efficiency review would act on. The value stays on the
    // row, next to its flag; it just does not become the headline.
    const summary = summariseCanonicalFuel([
      fuelRow({ consumptionPer100Km: 0, distanceKm: 7.14, flags: ['zero-consumption-rate-without-fuel-used'] }),
    ]);
    expect(summary.consumptionRate).toBeUndefined();
    expect(summary.fuelUsed).toBeUndefined();
  });
});

describe('fuel cost totals', () => {
  it('totals rows that agree on the currency marking', () => {
    const total = summariseFuelCost([
      fuelRow({ fuelCost: 100, fuelCostCurrencyCode: 'USD' }),
      fuelRow({ fuelCost: 24.5, fuelCostCurrencyCode: 'USD' }),
    ]).total;
    expect(total?.amount).toBeCloseTo(124.5);
    expect(total?.currencyCode).toBe('USD');
  });

  it('REFUSES to total across currencies, the way the finance module does', () => {
    // This platform sells into a market where the local currency and USD
    // circulate side by side. A sum across them is not a number.
    const result = summariseFuelCost([
      fuelRow({ fuelCost: 100, fuelCostCurrencyCode: 'USD' }),
      fuelRow({ fuelCost: 100, fuelCostCurrencyCode: 'ZWG' }),
    ]);
    expect(result.total).toBeUndefined();
    expect(result.warning?.code).toBe('mixed-fuel-cost-currencies');
  });

  it('does not treat an unmarked amount as matching a marked one', () => {
    expect(
      summariseFuelCost([fuelRow({ fuelCost: 10 }), fuelRow({ fuelCost: 10, fuelCostCurrencySymbol: '$' })]).total
    ).toBeUndefined();
  });

  it('offers nothing at all when no row carried a cost', () => {
    // Not a total of 0. The live sample sends "-" for Fuel Cost.
    expect(summariseFuelCost([fuelRow({ distanceKm: 7.14 })])).toEqual({});
  });
});

describe('driver parsing', () => {
  it('reports a row with no provider id instead of importing it', () => {
    // Importing it would create a fresh duplicate on every sync.
    const [driver] = parseDriverRows([{ name: 'Tendai M' }]);
    expect(driver.providerDriverId).toBe('');
    expect(driver.name).toBe('Tendai M');
  });

  it('takes the object key as the id for a uin-keyed payload', () => {
    const [driver] = parseDriverRows({ 'drv-9': { name: 'Rutendo' } });
    expect(driver.providerDriverId).toBe('drv-9');
  });
});

describe('trigger parsing', () => {
  it('maps the seven documented types and refuses an undocumented one', () => {
    expect(describeTriggerType(0)?.label).toBe('Geo-fence');
    expect(describeTriggerType(5)?.geofenceType).toBe('route');
    // An undocumented type must NOT silently inherit Geo-fence's
    // behaviour and manufacture a boundary.
    expect(describeTriggerType(7)).toBeNull();
  });

  it('does not treat a Stop Alert as idle', () => {
    // Idle means engine-running-while-stationary everywhere else in this
    // codebase. Filing stops as idle would inflate idle time with parked
    // vehicles.
    expect(describeTriggerType(4)?.alertType).toBe('vendor');
    expect(describeTriggerType(3)?.alertType).toBe('idle');
  });

  it('matches our own engine on speeding severity', () => {
    expect(triggerSeverity(describeTriggerType(1))).toBe('high');
    expect(triggerSeverity(describeTriggerType(3))).toBe('medium');
  });

  it('builds a circle geofence from a centre and radius', () => {
    const [trigger] = parseTriggerRows([
      { id: '4172', type: 0, name: 'Depot', lat: -17.82, lng: 31.05, radius: 250 },
    ]);
    expect(trigger.geometry).toEqual({
      kind: 'circle',
      center: { lat: -17.82, lng: 31.05 },
      radiusMeters: 250,
    });
  });

  it('attaches NO geometry to a spatial trigger whose coordinates are unreadable', () => {
    // Giving it a default centre and radius would be inventing a place,
    // and checkGeofence evaluates every geofence on every ping.
    const [trigger] = parseTriggerRows([{ id: '9', type: 0, name: 'Broken', points: 'not-coords' }]);
    expect(trigger.geometry).toBeUndefined();
  });

  it('attaches no geometry to a non-spatial type even when coordinates are present', () => {
    const [trigger] = parseTriggerRows([
      { id: '3', type: 1, speedLimit: 80, lat: -17.8, lng: 31.0, radius: 100 },
    ]);
    expect(trigger.geometry).toBeUndefined();
    expect(trigger.speedLimitKmh).toBe(80);
  });

  it('rejects a point list containing null island', () => {
    expect(parseTriggerPoints([{ lat: 0, lng: 0 }])).toBeNull();
    expect(parseTriggerPoints('-17.8,31.0;-17.9,31.1')).toHaveLength(2);
  });
});

describe('vendor alert parsing', () => {
  it('drops a row with no parseable timestamp rather than stamping it now', () => {
    // An alert stamped "now" on every sync surfaces a months-old event
    // as live and notifies fleet managers about it.
    expect(parseVendorAlertRows([{ alertType: 1, message: 'Overspeed' }], 'uin-1')).toHaveLength(0);
  });

  it("keeps the provider's own timestamp", () => {
    const [alert] = parseVendorAlertRows(
      [{ date: '2026-03-09 07:05:04', alertType: 1, alertId: 'a-1' }],
      'uin-1'
    );
    expect(alert.occurredAt.toISOString()).toBe('2026-03-09T07:05:04.000Z');
    expect(alert.typeLabel).toBe('Speed Alert');
  });

  it('derives a STABLE key when the provider sends no alert id', () => {
    // A random key would re-import the whole window on every run --
    // exactly the duplicate-prevention failure this guards against.
    const input = {
      uin: 'u1',
      typeCode: 1,
      occurredAt: new Date('2026-03-09T07:05:04Z'),
    };
    expect(buildVendorAlertKey(input)).toBe(buildVendorAlertKey(input));
    expect(buildVendorAlertKey({ ...input, providerAlertId: 'a-1' })).toBe('id:a-1');
  });
});
