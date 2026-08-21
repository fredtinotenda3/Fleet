// tests/unit/telematics/eagletrack-report-values.spec.ts
//
// /api2/reports/fuel returns a RENDERED TABLE, so every value is a
// display string rather than a JSON number. These tests pin the four
// outcomes that keep that honest:
//
//   absent      no alias matched -- may be the wrong field name
//   no-data     the provider explicitly said it has none ("-")
//   unparsable  a value arrived and could not be read
//   value       a number, on a unit we recognise
//
// The one that would be easiest to get wrong is `unparsable`. It is
// tempting to drop an unknown unit and keep the number, and that is
// exactly how io code 199 ("Fuel Consumption, L/h") was once written
// into a field the UI renders as "L/100km": the number survived, its
// meaning did not.

import {
  CONSUMPTION_PER_100KM_UNITS,
  DISTANCE_UNITS,
  VOLUME_UNITS,
  interpretMeasurement,
  isNoDataToken,
  parseCellNumber,
  parseFuelSummary,
  readMeasurement,
  readMoney,
} from '../../../modules/telematics/adapters/eagletrack/eagletrack-report-values';
import { indexRow } from '../../../modules/telematics/adapters/eagletrack/eagletrack-field-map';

describe('report cell numbers', () => {
  it('reads a plain decimal', () => {
    expect(parseCellNumber('7.14')).toBe(7.14);
    expect(parseCellNumber('-3')).toBe(-3);
  });

  it('accepts a strictly grouped thousands separator', () => {
    expect(parseCellNumber('34,853.05')).toBe(34853.05);
  });

  it('REFUSES an ambiguous comma rather than picking a convention', () => {
    // "1,5" is one-and-a-half across most of continental Europe and
    // fifteen with a stray separator elsewhere. A fuel report is not the
    // place to guess which.
    expect(parseCellNumber('1,5')).toBeNull();
    expect(parseCellNumber('1,23')).toBeNull();
  });

  it('rejects text that merely contains a number', () => {
    expect(parseCellNumber('about 7')).toBeNull();
    expect(parseCellNumber('')).toBeNull();
  });
});

describe('no-data markers', () => {
  it('recognises the hyphen the live deployment sends', () => {
    expect(isNoDataToken('-')).toBe(true);
    expect(isNoDataToken(' -- ')).toBe(true);
    expect(isNoDataToken('N/A')).toBe(true);
  });

  it('does not treat a real zero as no data', () => {
    // A reported 0 is a measurement. Collapsing the two is the whole
    // failure this integration removed the `?? 0` fallbacks to prevent.
    expect(isNoDataToken('0')).toBe(false);
  });
});

describe('measurement cells', () => {
  it('strips the unit the provider rendered', () => {
    const cell = interpretMeasurement('Distance', '7.14 km', DISTANCE_UNITS);
    expect(cell.status).toBe('value');
    expect(cell.value).toBe(7.14);
    expect(cell.unit).toBe('km');
  });

  it('reads a five-figure odometer with a grouped separator', () => {
    expect(interpretMeasurement('Start Odometer', '34,853.05 km', DISTANCE_UNITS).value).toBe(34853.05);
  });

  it('reports "-" as no-data, NOT as zero and NOT as absent', () => {
    const cell = interpretMeasurement('Fuel Used', '-', VOLUME_UNITS);
    expect(cell.status).toBe('no-data');
    expect(cell.value).toBeUndefined();
  });

  it('converts miles exactly, and says so', () => {
    const cell = interpretMeasurement('Distance', '10 miles', DISTANCE_UNITS);
    expect(cell.value).toBeCloseTo(16.09344, 5);
    expect(cell.unit).toBe('miles');
  });

  it('REFUSES an unrecognised unit instead of keeping the bare number', () => {
    // The io-199 lesson. "5 gal" is 18.9 L or 22.7 L depending on which
    // gallon, and the cell does not say. A bare `m` cannot be told from
    // a sloppy abbreviation for miles -- a 1000x error in an odometer is
    // a maintenance schedule and a depreciation charge, not a rounding
    // problem.
    expect(interpretMeasurement('Fuel Used', '5 gal', VOLUME_UNITS).status).toBe('unparsable');
    expect(interpretMeasurement('Distance', '34853 m', DISTANCE_UNITS).status).toBe('unparsable');
  });

  it('refuses an hourly burn rate where a per-distance rate is expected', () => {
    // L/h and L/100km are different quantities. Accepting one for the
    // other is how a stationary idling truck reports excellent economy.
    expect(interpretMeasurement('Fuel', '3.2 L/h', CONSUMPTION_PER_100KM_UNITS).status).toBe('unparsable');
    expect(interpretMeasurement('Fuel', '9.4 /100km', CONSUMPTION_PER_100KM_UNITS).value).toBe(9.4);
  });

  it('rejects a boolean rather than coercing it to one litre', () => {
    expect(interpretMeasurement('Fuel Used', true, VOLUME_UNITS).status).toBe('unparsable');
  });

  it('returns null -- not a cell -- when no alias matched at all', () => {
    // "We never found the field" and "the provider says it has none"
    // must not collapse: only the second is a fact about the vehicle.
    expect(readMeasurement(indexRow({ Something: '1 km' }), ['distance'], DISTANCE_UNITS)).toBeNull();
    expect(readMeasurement(indexRow({ Distance: '-' }), ['distance'], DISTANCE_UNITS)?.status).toBe('no-data');
  });
});

describe('money cells', () => {
  it('reads an amount with a three-letter code', () => {
    const cell = readMoney(indexRow({ 'Fuel Cost': '124.50 USD' }), ['fuelCost']);
    expect(cell?.amount).toBe(124.5);
    expect(cell?.currencyCode).toBe('USD');
  });

  it('keeps a symbol verbatim and does NOT resolve it to a currency', () => {
    // "$" is shared by a dozen currencies, and this platform sells into
    // a market where the local one and USD circulate side by side.
    // Guessing would let two currencies be summed into one total.
    const cell = readMoney(indexRow({ 'Fuel Cost': '$18.00' }), ['fuelCost']);
    expect(cell?.amount).toBe(18);
    expect(cell?.currencySymbol).toBe('$');
    expect(cell?.currencyCode).toBeUndefined();
  });

  it('reports "-" as no-data rather than a free tank', () => {
    expect(readMoney(indexRow({ 'Fuel Cost': '-' }), ['fuelCost'])?.status).toBe('no-data');
  });
});

describe('the composite Fuel summary column', () => {
  const LIVE =
    'Fuel Filling Times: 0; Fuel Filling: 0 ; Fuel Leakage Times: 0; Fuel Leakage: 0 ; Fuel Consumption: 0 /100km';

  it('extracts every figure from the live string', () => {
    const summary = parseFuelSummary(LIVE);
    expect(summary?.refuelEventCount?.value).toBe(0);
    expect(summary?.refuelledLitres?.value).toBe(0);
    expect(summary?.drainEventCount?.value).toBe(0);
    expect(summary?.drainedLitres?.value).toBe(0);
    expect(summary?.consumptionPer100Km?.value).toBe(0);
    expect(summary?.unmappedLabels).toEqual([]);
  });

  it('matches labels EXACTLY, so a count is never read as a volume', () => {
    // "Fuel Filling Times" and "Fuel Filling" differ only by a suffix.
    // Prefix matching would read the event count as litres.
    const summary = parseFuelSummary('Fuel Filling Times: 3; Fuel Filling: 41.5 L');
    expect(summary?.refuelEventCount?.value).toBe(3);
    expect(summary?.refuelledLitres?.value).toBe(41.5);
  });

  it('reports a label it could not place instead of dropping it', () => {
    const summary = parseFuelSummary('Fuel Consumption: 9 /100km; Idle Burn: 2');
    expect(summary?.consumptionPer100Km?.value).toBe(9);
    expect(summary?.unmappedLabels).toContain('Idle Burn');
  });

  it('treats an entry with no label as evidence the delimiter assumption is wrong', () => {
    expect(parseFuelSummary('some free text')?.unmappedLabels).toContain('some free text');
  });

  it('returns null for a summary the provider marked as having no data', () => {
    expect(parseFuelSummary('-')).toBeNull();
    expect(parseFuelSummary(undefined)).toBeNull();
  });
});
