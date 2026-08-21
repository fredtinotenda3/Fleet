// tests/security/telematics-eagletrack-fuel-attribution.spec.ts
//
// The failure this file exists to catch is MISATTRIBUTION, not a read
// leak. GET /api/telematics/eagletrack/fuel/[vehicleId] is already
// gated on FUEL_VIEW and already scope-checks the vehicle through
// assertVehicleInScope, so a caller cannot ask about a vehicle they do
// not own. What the scope check cannot police is what comes BACK.
//
// A /api2/reports/fuel row carries no uin. Its only identifier is the
// `Name` column. The request is made for one tracker, so ordinarily
// every row is that tracker's -- but if a deployment ignores the `uin`
// filter and answers with the whole account's report, attributing rows
// by the requested uin alone would write every other vehicle's
// distance, fuel and spend into this vehicle's report. In a tenant where
// several branches share one Eagle Track account, that crosses org units
// while every scope check in the request passes.
//
// Same class as the adapter's matching rules ("a wrong match is worse
// than no match"), reached through the report endpoint rather than the
// roster. attributeRows is where the rule lives, and it is pure, so this
// tests it directly rather than through a mocked client.

import { attributeRows } from '../../modules/telematics/services/eagletrack-fuel.service';
import type { EagleTrackFuelReportRow } from '../../modules/telematics/adapters/eagletrack/eagletrack.types';

function row(providerName: string | undefined, distanceKm: number): EagleTrackFuelReportRow {
  return {
    uin: '861234567890123',
    ...(providerName ? { providerName } : {}),
    distanceKm,
    noDataFields: [],
    unparsableFields: [],
    flags: [],
    unmappedFields: [],
    unmappedFuelSummaryLabels: [],
    raw: {},
  };
}

describe('fuel report row attribution', () => {
  it('keeps every row when the report names only this vehicle', () => {
    const result = attributeRows([row('AFU0078', 7.14), row('AFU0078', 12.2)], 'AFU0078');
    expect(result.rows).toHaveLength(2);
    expect(result.excluded).toBe(0);
    expect(result.warnings).toEqual([]);
  });

  it('folds case and whitespace, exactly as findByLicensePlate does', () => {
    // Canonicalisation, not fuzzy matching: no substring search, no
    // similarity scoring, no plate-shaped regex.
    expect(attributeRows([row(' afu0078 ', 1)], 'AFU0078').rows).toHaveLength(1);
  });

  it('does NOT match a plate that merely contains ours', () => {
    const result = attributeRows([row('AFU0078', 1), row('AFU00781', 999)], 'AFU0078');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].distanceKm).toBe(1);
  });

  it('EXCLUDES another tracker\'s rows when the provider ignored the uin filter', () => {
    // The row that must never survive: 4,000 km belonging to a vehicle
    // in another branch, arriving in this vehicle's fuel report.
    const result = attributeRows([row('AFU0078', 7.14), row('ADY2531', 4000)], 'AFU0078');

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].distanceKm).toBe(7.14);
    expect(result.excluded).toBe(1);
    expect(result.warnings[0].code).toBe('rows-excluded-for-other-trackers');
    // Named, so an operator can see WHOSE rows arrived rather than only
    // that some were dropped.
    expect(result.warnings[0].detail).toContain('ADY2531');
  });

  it('keeps NOTHING when several trackers are named and none is ours', () => {
    // Fail closed. An empty report with a stated reason is recoverable;
    // a plausible report built from another vehicle's fuel is not.
    const result = attributeRows([row('ADY2531', 400), row('ADL5345', 900)], 'AFU0078');

    expect(result.rows).toEqual([]);
    expect(result.excluded).toBe(2);
    expect(result.warnings[0].code).toBe('no-row-matches-vehicle');
  });

  it('caps how many foreign tracker names a warning will list', () => {
    // A response is not a log file, and a hostile deployment must not be
    // able to inflate one by naming a thousand trackers.
    const rows = Array.from({ length: 30 }, (_, i) => row(`TRK${i}`, 1));
    const detail = attributeRows(rows, 'AFU0078').warnings[0].detail;
    expect(detail).toContain('+20 more');
  });

  it('keeps a single differently-named tracker rather than withholding its report', () => {
    // Trackers are legitimately named things that are not plates
    // ("DashCam2"), and the request was already scoped to one uin. With
    // nothing to confuse it with there is no misattribution risk, so
    // this reports the divergence instead of discarding real data.
    const result = attributeRows([row('DashCam2', 7.14)], 'AFU0078');

    expect(result.rows).toHaveLength(1);
    expect(result.excluded).toBe(0);
    expect(result.warnings[0].code).toBe('provider-name-differs-from-plate');
  });

  it('keeps rows that carry no name at all', () => {
    // A deployment whose report has no Name column still gets its data;
    // there is nothing contradicting the single-tracker request.
    const result = attributeRows([row(undefined, 7.14)], 'AFU0078');
    expect(result.rows).toHaveLength(1);
    expect(result.warnings).toEqual([]);
  });

  it('is pure -- it does not mutate the rows it was given', () => {
    // The endpoint is a GET that stores nothing, so N identical calls
    // must leave both the system and the payload exactly as one does.
    const rows = [row('AFU0078', 7.14), row('ADY2531', 4000)];
    const snapshot = JSON.stringify(rows);

    attributeRows(rows, 'AFU0078');
    attributeRows(rows, 'AFU0078');

    expect(JSON.stringify(rows)).toBe(snapshot);
    expect(attributeRows(rows, 'AFU0078')).toEqual(attributeRows(rows, 'AFU0078'));
  });
});
