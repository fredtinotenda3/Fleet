// modules/fuel/services/fuel-query.service.ts

import { queryBus } from '@/server/cqrs/query-bus';
import { GetFuelLogsQuery } from '../queries/get-fuel-logs.query';
import { GetFuelLogByIdQuery } from '../queries/get-fuel-log-by-id.query';
import {
  FuelLog,
  FuelFilters,
  FuelStats,
  FuelKpis,
  AbnormalFuelConsumptionRow,
  DriverFuelConsumptionRow,
  FuelTrendGranularity,
  VehicleFuelTimelinePoint,
  FuelByStationRow,
  FuelActivityTrendPoint,
  FuelPriceTrendPoint,
  FuelTypeDistributionRow,
  FuelFrequencyByVehicleRow,
  FuelCostDistributionBucket,
  FuelHeatmapCell,
  FuelLedgerReconciliation,
} from '@/shared/types/fuel.types';
import { PaginatedResponse, PaginationParams } from '@/shared/types/common.types';
import { AnalyticsScope, isFleetScope } from '@/shared/types/analytics-scope.types';
import type { TenantContext } from '@/modules/tenancy/services/tenant-context.service';
import type { FuelByDriverSort } from '../queries/get-fuel-by-driver.query';
import type { VehicleFuelTimelineFilters } from '../queries/get-vehicle-fuel-timeline.query';
import { fuelRepository } from '../repositories/fuel.repository';
import { tripRepository } from '@/modules/trips/repositories/trip.repository';
import { allocationLedgerRepository } from '@/modules/finance/repositories/allocation-ledger.repository';
import { roundCurrency } from '@/modules/finance/utils/fx-conversion.utils';
import { financeSettingsService } from '@/modules/finance/services/finance-settings.service';
import { ValidationError } from '@/server/errors/app.errors';

// FIX (Phase B -- repository/analytics scoping completeness): the 13
// analytics methods below previously routed through queryBus -> a Query
// class -> a Handler that simply forwarded (tenantId, dateRange, scope)
// to the repository, with no `context` anywhere in that chain. Threading
// org-unit scoping through 13 query classes + 13 handlers per domain
// (~100+ files across fuel/expense/trip/maintenance, none of which carry
// business logic beyond a repository passthrough) is disproportionate to
// the fix. Instead these now call the (already org-unit-scoped)
// repository directly, matching the precedent already set by
// `getFuelKpis` below, which never went through queryBus to begin with.
// CRUD/list methods (getFilteredLogs, getFuelLogById) are unchanged and
// still routed through the CQRS bus.
export class FuelQueryService {
  async getFilteredLogs(
    filters: FuelFilters,
    pagination: PaginationParams,
    tenantId: string
  ): Promise<PaginatedResponse<FuelLog>> {
    return queryBus.execute<PaginatedResponse<FuelLog>>(
      new GetFuelLogsQuery(filters, pagination, tenantId)
    );
  }

  async getFuelLogById(fuelLogId: string, tenantId: string): Promise<FuelLog> {
    return queryBus.execute<FuelLog>(
      new GetFuelLogByIdQuery(fuelLogId, tenantId)
    );
  }

  async getFuelStats(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    scope?: AnalyticsScope,
    context?: TenantContext
  ): Promise<FuelStats> {
    return fuelRepository.getFuelStats(tenantId, dateRange, scope, context);
  }

  async getMonthlyFuelConsumption(
    tenantId: string,
    months: number = 12,
    scope?: AnalyticsScope,
    context?: TenantContext
  ): Promise<Array<{ month: string; fuel: number; cost: number }>> {
    return fuelRepository.getMonthlyFuelConsumption(tenantId, months, scope, context);
  }

  async getTopFuelConsumers(
    tenantId: string,
    limit: number = 5,
    scope?: AnalyticsScope,
    context?: TenantContext
  ): Promise<Array<{ license_plate: string; totalFuel: number; totalCost: number }>> {
    return fuelRepository.getTopFuelConsumers(tenantId, limit, scope, context);
  }

  /**
   * Backs the "Fuel cost by driver" / "Fuel consumption by driver" chart.
   *
   * FIX (driver attribution must come from the Vehicle Operational Hub):
   * now calls FuelRepository.getFuelByAssignedDriver -- which groups by
   * each vehicle's CURRENT Operational Hub assignment
   * (Vehicle.currentDriverId) -- instead of the repository's older
   * getFuelByDriver, which groups by each fuel log's own
   * transaction-time driver_id and stayed stale after a reassignment.
   * The public method name/signature here is unchanged (so no hook,
   * query-key, or API route needed to change) -- only which repository
   * method backs it.
   *
   * getFuelByDriver itself is untouched and still used directly (not via
   * this service method) by the Monthly Fuel & Fleet Intelligence
   * Report's driverFindings section, which deliberately needs the
   * transaction-time semantics -- see that repository method's doc
   * comment. Do not repoint this service method back to it.
   */
  async getFuelByDriver(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    limit: number = 10,
    sortBy: FuelByDriverSort = 'volume',
    scope?: AnalyticsScope,
    context?: TenantContext
  ): Promise<DriverFuelConsumptionRow[]> {
    return fuelRepository.getFuelByAssignedDriver(tenantId, dateRange, limit, sortBy, scope, context);
  }

  /**
   * Scope-aware KPI cards. When `scope` is a vehicle scope, the trip
   * distance fallback maps are still computed fleet-wide (trip data has
   * no scope filter here) but only the entries matching the scoped
   * vehicle's license_plate are ever consulted downstream, since
   * FuelRepository.getFuelKpis's own per-vehicle grouping is already
   * narrowed to that single vehicle by the scope-filtered base match --
   * so results are correct for "Vehicle Analytics" without any change to
   * the trip-distance computation itself.
   *
   * `context` (Phase B) is passed to both the trip-distance lookups and
   * the fuel KPI aggregation so branch/department/workshop scoping is
   * applied consistently across both data sources feeding this card.
   */
  async getFuelKpis(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    scope?: AnalyticsScope,
    context?: TenantContext
  ): Promise<FuelKpis> {
    const now = new Date();
    const rangeEnd = dateRange?.endDate ?? now;
    const rangeStart = dateRange?.startDate ?? new Date(rangeEnd.getTime() - 90 * 24 * 60 * 60 * 1000);
    const periodMs = rangeEnd.getTime() - rangeStart.getTime();
    const prevRangeEnd = new Date(rangeStart.getTime() - 1);
    const prevRangeStart = new Date(prevRangeEnd.getTime() - periodMs);

    const [tripDistanceByVehicle, prevTripDistanceByVehicle] = await Promise.all([
      tripRepository.getDistanceByVehicle(tenantId, rangeStart, rangeEnd, context),
      tripRepository.getDistanceByVehicle(tenantId, prevRangeStart, prevRangeEnd, context),
    ]);

    return fuelRepository.getFuelKpis(
      tenantId,
      dateRange,
      tripDistanceByVehicle,
      prevTripDistanceByVehicle,
      scope,
      context
    );
  }

  async getAbnormalConsumption(
    tenantId: string,
    threshold: number = 2,
    scope?: AnalyticsScope,
    context?: TenantContext
  ): Promise<AbnormalFuelConsumptionRow[]> {
    return fuelRepository.getAbnormalConsumption(tenantId, threshold, scope, context);
  }

  // ---- Enterprise analytics (all scope-aware) ----

  async getVehicleFuelTimeline(
    tenantId: string,
    filters: VehicleFuelTimelineFilters,
    context?: TenantContext
  ): Promise<VehicleFuelTimelinePoint[]> {
    return fuelRepository.getVehicleFuelTimeline(tenantId, filters, context);
  }

  async getFuelByStation(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    limit: number = 15,
    scope?: AnalyticsScope,
    context?: TenantContext
  ): Promise<FuelByStationRow[]> {
    return fuelRepository.getFuelByStation(tenantId, dateRange, limit, scope, context);
  }

  async getFuelActivityTrend(
    tenantId: string,
    granularity: FuelTrendGranularity,
    dateRange?: { startDate?: Date; endDate?: Date },
    scope?: AnalyticsScope,
    context?: TenantContext
  ): Promise<FuelActivityTrendPoint[]> {
    return fuelRepository.getFuelActivityTrend(tenantId, granularity, dateRange, scope, context);
  }

  async getAverageFuelPriceTrend(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    granularity: FuelTrendGranularity = 'month',
    scope?: AnalyticsScope,
    context?: TenantContext
  ): Promise<FuelPriceTrendPoint[]> {
    return fuelRepository.getAverageFuelPriceTrend(tenantId, dateRange, granularity, scope, context);
  }

  async getFuelTypeDistribution(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    scope?: AnalyticsScope,
    context?: TenantContext
  ): Promise<FuelTypeDistributionRow[]> {
    return fuelRepository.getFuelTypeDistribution(tenantId, dateRange, scope, context);
  }

  /**
   * Note: when `scope` is a vehicle scope this necessarily returns at
   * most one row (that vehicle). Left scope-aware anyway rather than
   * special-cased, so the frontend never has to know which charts
   * "don't support" vehicle scope -- the engine just answers correctly
   * either way, per the "every vehicle behaves like a miniature fleet"
   * requirement.
   */
  async getFuelingFrequencyByVehicle(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    limit: number = 20,
    scope?: AnalyticsScope,
    context?: TenantContext
  ): Promise<FuelFrequencyByVehicleRow[]> {
    return fuelRepository.getFuelingFrequencyByVehicle(tenantId, dateRange, limit, scope, context);
  }

  async getFuelCostDistribution(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    scope?: AnalyticsScope,
    context?: TenantContext
  ): Promise<FuelCostDistributionBucket[]> {
    return fuelRepository.getFuelCostDistribution(tenantId, dateRange, scope, context);
  }

  async getFuelEntryHeatmap(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    scope?: AnalyticsScope,
    context?: TenantContext
  ): Promise<FuelHeatmapCell[]> {
    return fuelRepository.getFuelEntryHeatmap(tenantId, dateRange, scope, context);
  }

  /**
   * MODULE CONNECTIVITY UPGRADE (fuel/GL reconciliation gap). Whether
   * this ONE fuel log's financial value actually reached the allocation
   * ledger, and whether it still agrees with what's posted.
   *
   * `log` is the caller's already-loaded, already-scope-checked
   * FuelLog (see fuel.controller.ts#loadInScopeFuelLog) -- this method
   * does its own ledger read (scoped via `context`) but trusts that
   * access to the fuel log itself was already authorized, rather than
   * re-deriving it from `log.license_plate`.
   */
  async getLedgerReconciliation(
    fuelLogId: string,
    log: Pick<FuelLog, 'cost' | 'currency'>,
    context: TenantContext
  ): Promise<FuelLedgerReconciliation> {
    const postings = await allocationLedgerRepository.findBySource('tblfuellogs', fuelLogId, 'fuel', context);

    if (postings.length === 0) {
      return {
        posting: null,
        status: 'not_posted',
        varianceFromCurrentCost: null,
        notPostedReason: await this.resolveNotPostedReason(log, context),
        volumeReconciliation: 'not_applicable',
      };
    }

    // Net of any reversal, same discipline as every other ledger
    // aggregation in this codebase (a reversing posting carries the
    // equal-and-opposite amount, so summing nets it to zero rather than
    // hiding the original).
    const netAmount = roundCurrency(postings.reduce((sum, p) => sum + p.amount, 0));
    const latest = postings[postings.length - 1];
    const variance = roundCurrency(log.cost - netAmount);
    // A fraction-of-a-cent difference is rounding, not a real variance.
    const matched = Math.abs(variance) < 0.01;

    return {
      posting: {
        id: String(latest._id),
        amount: netAmount,
        currency: latest.currency,
        postedAt: latest.postedAt,
        glAccountCode: latest.glAccountCode ?? null,
      },
      status: matched ? 'matched' : 'stale',
      varianceFromCurrentCost: matched ? null : variance,
      notPostedReason: null,
      volumeReconciliation: 'not_applicable',
    };
  }

  /**
   * DATA HONESTY AUDIT fix (Round 3, re-verification pass): this used to
   * return one hedged sentence listing three POSSIBLE causes ("this can
   * happen when the event is still processing, the organization has no
   * reporting currency configured, or the log currency had no exchange
   * rate at the time") for every not-posted log, no matter which one
   * actually applied -- which is itself a form of the exact problem this
   * audit exists to catch: a confident-sounding explanation with nothing
   * behind it, when FuelLedgerReconciliation.notPostedReason's own doc
   * comment promises "a real, known refusal cause, never a guess at one".
   *
   * AllocationPostingHandler only LOGS a refusal's reason (monitoring.
   * logWarn) -- it is never persisted anywhere this read path can query,
   * so which of those three causes actually fired for a given historical
   * log is genuinely not reconstructable after the fact, and this method
   * must not pretend otherwise.
   *
   * One of the three causes IS independently checkable right now, though:
   * whether the organization currently has a resolvable reporting
   * currency at all (financeSettingsService.resolve throws a
   * ValidationError when neither financeSettings.reportingCurrency nor
   * the organization's operating currency is set -- see that service's
   * own comment). A freshly onboarded tenant -- the exact "Harare SME,
   * day one" scenario this round re-verifies -- has not configured
   * finance settings yet, so every fuel log it logs will refuse to post
   * for this one, deterministic, currently-true reason. Surfacing that
   * precisely (instead of folding it into the three-way hedge) is a real
   * improvement a reader can act on: it names the one setting to change,
   * rather than three possibilities to guess between.
   *
   * The remaining two causes (processing lag; no FX rate for this
   * currency AT THE TIME it was logged) stay a hedge on purpose -- FX
   * rates change over time, so today's rate availability for
   * `log.currency` would not accurately answer what happened at posting
   * time, and inventing that answer would be exactly the over-confident
   * guess this method exists to avoid.
   */
  private async resolveNotPostedReason(
    log: Pick<FuelLog, 'cost' | 'currency'>,
    context: TenantContext
  ): Promise<string> {
    if (log.cost === 0) {
      return 'Zero-cost fuel logs are never posted to the ledger.';
    }

    try {
      await financeSettingsService.resolve(context.organizationId);
    } catch (error) {
      if (error instanceof ValidationError) {
        return (
          'This organization has no reporting currency configured yet, so costs cannot post to the ' +
          'ledger until finance settings are set (Settings -> Finance -> Reporting currency).'
        );
      }
      // Any other failure resolving settings (e.g. the organization
      // record itself is missing) is a deeper problem than this one
      // fuel log's posting status -- fall through to the honest hedge
      // below rather than asserting a cause this catch block cannot
      // actually confirm.
    }

    return (
      'Not yet posted -- this can happen when the event is still processing, or the log currency had ' +
      'no exchange rate available at the time it was logged.'
    );
  }
}

export const fuelQueryService = new FuelQueryService();