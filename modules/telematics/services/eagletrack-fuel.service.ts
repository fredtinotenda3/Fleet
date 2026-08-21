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
// arithmetic presented to an operator as the provider's measurement.
//
// A field the provider did not send is ABSENT, never 0. That is the same
// rule the `?? 0` removal established for live telemetry, and it matters
// more here: a fuel report showing "0 L consumed" reads as a vehicle
// that did not move, while "No data" reads as a device that does not
// report fuel. Those are opposite operational conclusions.
//
// ---------------------------------------------------------------------
// FIELD NAMES ARE NOT CONFIRMED
// ---------------------------------------------------------------------
// This endpoint has never been called against a live deployment. The row
// shape is read through eagletrack-payload.parsers.ts's candidate
// aliases, and every response carries `unmappedFields` -- the vendor
// keys no alias claimed. One real request against a tenant deployment
// turns that list into a one-line correction in the alias table. Until
// then, a value that comes back absent may mean "the device does not
// report it" OR "we are looking for it under the wrong name", and
// `unmappedFields` is what tells the two apart.
//
// ---------------------------------------------------------------------
// CANONICAL MAPPING
// ---------------------------------------------------------------------
// TelematicsData.fuel is `{ consumptionRate, instantConsumption,
// fuelUsed }`. Two of the three have an exact counterpart in a fuel
// report and are mapped; `instantConsumption` (L/h) has none, because a
// period report carries no instantaneous rate, so it is left absent
// rather than filled with a period average wearing the wrong unit.
//
// The mapped block is returned ALONGSIDE the period figures rather than
// instead of them: a report row carries refuel and drain volumes that
// TelematicsData has no field for at all, and dropping them to fit the
// canonical shape would discard the most operationally interesting part
// of a fuel report.

import { monitoring } from '@/infrastructure/monitoring/logger';
import { TenantContext } from '@/modules/tenancy/services/tenant-context.service';
import { eagletrackAdapter } from '../adapters/eagletrack/eagletrack.adapter';
import { clampRange, EagleTrackRangeQuery } from '../adapters/eagletrack/eagletrack-date-range';
import { parseFuelReportRows } from '../adapters/eagletrack/eagletrack-payload.parsers';
import { EagleTrackFuelReportRow } from '../adapters/eagletrack/eagletrack.types';
import { telematicsRepository } from '../repositories/telematics.repository';
import { TelematicsData } from '../types/telematics.types';
import { assertVehicleInScope } from './telematics-scope.utils';

/** Longest fuel-report window a caller may request. A period report is an aggregate; a year of them in one call is a different feature. */
export const MAX_FUEL_REPORT_SPAN_MS = 92 * 24 * 60 * 60_000;

export interface EagleTrackFuelReport {
  vehicleId: string;
  licensePlate: string;
  uin: string | null;
  rows: EagleTrackFuelReportRow[];
  /**
   * The subset of the report that maps onto TelematicsData.fuel,
   * totalled across rows. Members are present only when at least one row
   * carried them.
   */
  canonicalFuel: Pick<TelematicsData['fuel'], 'fuelUsed' | 'consumptionRate'>;
  /** Vendor keys no candidate alias claimed, deduplicated across rows. The correction list. */
  unmappedFields: string[];
  providerQuery: EagleTrackRangeQuery | null;
  /** Present when the vendor could not be reached. `rows` is then empty rather than wrong. */
  providerError?: string;
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
      providerQuery: null,
    };

    if (!uin) return report;

    const client = await eagletrackAdapter.buildClientFor(context.organizationId);
    if (!client) {
      report.providerError = 'Eagle Track is not configured or not enabled for this organization.';
      return report;
    }

    try {
      const response = await client.getFuelReport({ uin, from, to });
      report.providerQuery = response.range;
      report.rows = parseFuelReportRows(response.rows, uin);
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

    report.canonicalFuel = summariseCanonicalFuel(report.rows);
    report.unmappedFields = Array.from(
      new Set(report.rows.flatMap((row) => row.unmappedFields))
    ).sort();

    return report;
  }
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
 * through unchanged, since there is nothing to reconcile it against.
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
  } else if (rows.length === 1 && typeof rows[0].consumptionPer100Km === 'number') {
    out.consumptionRate = rows[0].consumptionPer100Km;
  }

  return out;
}

export const eagletrackFuelService = new EagleTrackFuelService();
