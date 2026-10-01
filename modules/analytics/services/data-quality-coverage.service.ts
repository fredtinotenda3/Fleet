// modules/analytics/services/data-quality-coverage.service.ts
//
// PART 11 -- "Data Quality / Data Coverage": how much of the fleet's
// operational data actually EXISTS, by category, so management can
// gauge how much confidence to place in figures built from it (a fleet
// at 34% GPS coverage should not expect a GPS-based safety scorecard to
// mean much yet).
//
// ---------------------------------------------------------------------
// THIS IS NOT A SCORE
// ---------------------------------------------------------------------
// PART 11 explicitly warns against "a meaningless score" -- each figure
// below is a plain coverage PERCENTAGE with a stated, reproducible
// definition (what counts as "covered", over what population, over what
// window), not a blended index. There is no overall "data quality score"
// computed by combining them; a reader who wants a single number is
// better served by the six honest ones than by one dishonest blend --
// the same lesson modules/ai/services/fleet-health.service.ts already
// learned the hard way about its own weighted score (see that file's own
// extensive header).
//
// ---------------------------------------------------------------------
// WINDOWS, NAMED AND DOCUMENTED (never silently hard-coded)
// ---------------------------------------------------------------------
// "Fuel records: 94%" / "Trip record coverage" in the brief's examples
// have no stated time window, which would make either 100% (any fuel log
// ever) or near-0% (today only) depending on fleet age -- neither is a
// useful answer to "is this data current". Both are therefore defined as
// RECENCY windows: did this vehicle produce the record type recently
// enough to still be trusted as reflecting current operations.
//
// ---------------------------------------------------------------------
// SCOPE
// ---------------------------------------------------------------------
// Every count here is taken over vehicles IN THE CALLER'S SCOPE
// (tenantScopeService.buildFilter, the same predicate every other
// scoped read in this codebase uses) -- a branch manager's coverage
// figures describe their own branch, not the whole tenant.

import connectToDatabase from '@/infrastructure/database/mongodb';
import { TenantContext } from '@/modules/tenancy/services/tenant-context.service';
import { tenantScopeService } from '@/modules/tenancy/services/tenant-scope.service';
import { vehicleRepository } from '@/modules/vehicles/repositories/vehicle.repository';
import type { Vehicle } from '@/shared/types/vehicle.types';

/** A fuel log must fall within this many trailing days to count toward "has current fuel records". */
export const FUEL_RECENCY_WINDOW_DAYS = 90;
/** A trip must fall within this many trailing days to count toward "has current trip records". Shorter than fuel's window because trips are the higher-frequency record type for an active vehicle. */
export const TRIP_RECENCY_WINDOW_DAYS = 30;

export interface CoverageMetric {
  label: string;
  /** How many vehicles (in scope) count as "covered" by this definition. */
  coveredCount: number;
  /** The population this percentage is taken over. Almost always totalVehicles, called out per-metric in case that ever changes. */
  totalCount: number;
  percent: number;
  /** Plain-English statement of exactly what counts as "covered" -- PART 11: "explain what each percentage means". */
  definition: string;
}

export interface DataQualityCoverageReport {
  totalVehicles: number;
  metrics: CoverageMetric[];
  generatedAt: Date;
}

function percentOf(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

export class DataQualityCoverageService {
  async getCoverage(context: TenantContext): Promise<DataQualityCoverageReport> {
    const db = await connectToDatabase();

    // Reuses the exact same scoped-query construction every other
    // vehicle read in this codebase goes through, so "in scope" here
    // means precisely what it means everywhere else -- including a
    // 10,000-row cap matching the documented "non-paginated path for
    // legacy dashboard usage" convention (see TripController.getTrips),
    // since this is a fleet-wide aggregate, not a paginated list.
    const { data: vehicles, pagination } = await vehicleRepository.getFilteredVehiclesInScope(
      {},
      { page: 1, limit: 10_000 },
      context
    );
    const totalVehicles = pagination.total;

    if (totalVehicles === 0) {
      return {
        totalVehicles: 0,
        metrics: [],
        generatedAt: new Date(),
      };
    }

    const vehicleIds = vehicles.map((v) => String((v as Vehicle & { _id: unknown })._id));
    const licensePlates = vehicles.map((v) => v.license_plate);
    const now = new Date();
    const fuelCutoff = new Date(now.getTime() - FUEL_RECENCY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const tripCutoff = new Date(now.getTime() - TRIP_RECENCY_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    // Same org-unit predicate the vehicle query itself used, applied to
    // each sibling collection -- every one of them carries its OWN
    // orgUnitId (module-scope.registry.ts: orgUnitSource 'vehicle',
    // stamped at write time), so this is the same scope boundary, not a
    // looser one reached by joining through vehicleIds alone.
    // Cast to a plain record, same as every other caller that applies
    // this filter across SEVERAL unrelated collection shapes (e.g.
    // fleet-health.service.ts, driver-risk.service.ts) rather than one
    // repository's own entity type -- there is no single `T` here that
    // correctly describes tbltelematics_devices, tblfuellogs, tbltrips
    // AND tblreminders at once.
    const scopeFilter = tenantScopeService.buildFilter(context, 'orgUnitId') as Record<string, unknown>;
    const tenantFilter = { tenantId: context.organizationId };

    const [
      vehiclesWithActiveDevice,
      vehiclesWithRecentFuel,
      vehiclesWithRecentTrips,
      vehiclesWithAnyMaintenance,
    ] = await Promise.all([
      db.collection('tbltelematics_devices').distinct('vehicleId', {
        ...tenantFilter,
        ...scopeFilter,
        isDeleted: { $ne: true },
        status: 'active',
        vehicleId: { $in: vehicleIds },
      }),
      db.collection('tblfuellogs').distinct('license_plate', {
        ...tenantFilter,
        ...scopeFilter,
        isDeleted: { $ne: true },
        date: { $gte: fuelCutoff },
        license_plate: { $in: licensePlates },
      }),
      db.collection('tbltrips').distinct('license_plate', {
        ...tenantFilter,
        ...scopeFilter,
        isDeleted: { $ne: true },
        date: { $gte: tripCutoff },
        license_plate: { $in: licensePlates },
      }),
      db.collection('tblreminders').distinct('license_plate', {
        ...tenantFilter,
        ...scopeFilter,
        isDeleted: { $ne: true },
        license_plate: { $in: licensePlates },
      }),
    ]);

    const odometerKnownCount = vehicles.filter(
      (v) => typeof v.odometer === 'number' && Number.isFinite(v.odometer)
    ).length;
    const driverAssignedCount = vehicles.filter((v) => !!v.currentDriverId).length;

    const metrics: CoverageMetric[] = [
      {
        label: 'GPS / telematics coverage',
        coveredCount: vehiclesWithActiveDevice.length,
        totalCount: totalVehicles,
        percent: percentOf(vehiclesWithActiveDevice.length, totalVehicles),
        definition: 'Share of vehicles with a registered telematics device currently reporting as active.',
      },
      {
        label: 'Odometer coverage',
        coveredCount: odometerKnownCount,
        totalCount: totalVehicles,
        percent: percentOf(odometerKnownCount, totalVehicles),
        definition: 'Share of vehicles with a known odometer reading on file.',
      },
      {
        label: 'Fuel record coverage',
        coveredCount: vehiclesWithRecentFuel.length,
        totalCount: totalVehicles,
        percent: percentOf(vehiclesWithRecentFuel.length, totalVehicles),
        definition: `Share of vehicles with at least one fuel log recorded in the last ${FUEL_RECENCY_WINDOW_DAYS} days.`,
      },
      {
        label: 'Driver assignment coverage',
        coveredCount: driverAssignedCount,
        totalCount: totalVehicles,
        percent: percentOf(driverAssignedCount, totalVehicles),
        definition: 'Share of vehicles with a driver currently assigned.',
      },
      {
        label: 'Trip record coverage',
        coveredCount: vehiclesWithRecentTrips.length,
        totalCount: totalVehicles,
        percent: percentOf(vehiclesWithRecentTrips.length, totalVehicles),
        definition: `Share of vehicles with at least one trip recorded in the last ${TRIP_RECENCY_WINDOW_DAYS} days.`,
      },
      {
        label: 'Maintenance record coverage',
        coveredCount: vehiclesWithAnyMaintenance.length,
        totalCount: totalVehicles,
        percent: percentOf(vehiclesWithAnyMaintenance.length, totalVehicles),
        definition: 'Share of vehicles with at least one maintenance record of any kind on file.',
      },
    ];

    return { totalVehicles, metrics, generatedAt: now };
  }
}

export const dataQualityCoverageService = new DataQualityCoverageService();
