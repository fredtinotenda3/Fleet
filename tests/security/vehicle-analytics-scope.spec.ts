// tests/security/vehicle-analytics-scope.spec.ts
//
// PHASE 0, ITEM 6 FINDING: while auditing the 'analytics' module for
// registration in module-scope.registry.ts, found that
// VehicleRepository.getVehicleAnalytics() -- the aggregation behind the
// "cost by vehicle" panel of fleetAnalyticsService.getCostBreakdown() --
// had NO org-unit scoping option at all, unlike every sibling *Stats
// method on the same repository, and its only caller forgot to pass the
// TenantContext it otherwise threads through every other repository
// call in the same method. A caller restricted to one branch's vehicles
// would have seen every OTHER branch's vehicles in this one panel.
//
// This is exactly the "aggregate endpoint forgotten, list endpoint
// scoped" pattern this codebase has hit before (see the 'attention'
// registry entry's history and the org-unit-isolation suite's header).
// Fixed in this pass: getVehicleAnalytics now accepts an optional
// TenantContext and applies tenantScopeService.buildFilter the same way
// getVehicleStats does; getCostBreakdown now forwards it.
//
// This suite captures the $match stage getVehicleAnalytics's aggregate()
// call is built with, rather than running the full pipeline (its
// $lookup/$addFields stages are outside what tests/helpers/fake-
// collection.ts's aggregate() emulates), and asserts the org-unit
// predicate is present precisely when a scope-restricted context is
// passed.

import { VehicleRepository } from '../../modules/vehicles/repositories/vehicle.repository';
import { fleetAnalyticsService } from '../../modules/analytics/services/fleet-analytics.service';
import { vehicleRepository } from '../../modules/vehicles/repositories/vehicle.repository';
import { expenseRepository } from '../../modules/expenses/repositories/expense.repository';
import { TenantContext } from '../../modules/tenancy/services/tenant-context.service';

const TENANT = 'willsgrove-farm-enterprises-9e80ed';
const HARARE_BRANCH = 'branch-harare';

function makeScopedContext(accessibleOrgUnitIds: string[] | null): TenantContext {
  return {
    organizationId: TENANT,
    organizationName: 'Willsgrove Farm Enterprises',
    accessibleOrgUnitIds,
    assignedOrgUnitIds: accessibleOrgUnitIds ?? [],
    isPlatformScope: false,
  } as TenantContext;
}

/** Captures the pipeline passed to aggregate() without running $lookup/$addFields, which fake-collection.ts does not emulate. */
class CapturingCollection {
  public capturedPipelines: Array<Array<Record<string, unknown>>> = [];

  aggregate(pipeline: Array<Record<string, unknown>>) {
    this.capturedPipelines.push(pipeline);
    return { toArray: async () => [] };
  }
}

describe('Phase 0: VehicleRepository.getVehicleAnalytics org-unit scoping', () => {
  let collection: CapturingCollection;
  let repo: VehicleRepository;

  beforeEach(() => {
    collection = new CapturingCollection();

    class TestVehicleRepository extends VehicleRepository {
      protected async getCollection(): Promise<any> {
        return collection as unknown as any;
      }
    }
    repo = new TestVehicleRepository();
  });

  it('applies NO org-unit filter when called with no context (tenant-wide, existing behaviour for org-wide roles)', async () => {
    await repo.getVehicleAnalytics(TENANT, new Date('2026-01-01'), new Date('2026-02-01'));

    const matchStage = collection.capturedPipelines[0][0].$match as Record<string, unknown>;
    expect(matchStage.orgUnitId).toBeUndefined();
  });

  it('applies an org-unit filter when called with a scope-restricted context -- the Phase 0 fix', async () => {
    const context = makeScopedContext([HARARE_BRANCH]);

    await repo.getVehicleAnalytics(TENANT, new Date('2026-01-01'), new Date('2026-02-01'), context);

    const matchStage = collection.capturedPipelines[0][0].$match as Record<string, unknown>;
    expect(matchStage.orgUnitId).toBeDefined();
    expect(matchStage.orgUnitId).toEqual({ $in: [HARARE_BRANCH] });
  });

  it('applies no org-unit filter for an org-wide role (accessibleOrgUnitIds: null) even with a context passed', async () => {
    const context = makeScopedContext(null);

    await repo.getVehicleAnalytics(TENANT, new Date('2026-01-01'), new Date('2026-02-01'), context);

    const matchStage = collection.capturedPipelines[0][0].$match as Record<string, unknown>;
    expect(matchStage.orgUnitId).toBeUndefined();
  });
});

describe('Phase 0: fleetAnalyticsService.getCostBreakdown forwards context to getVehicleAnalytics', () => {
  const originalGetVehicleAnalytics = vehicleRepository.getVehicleAnalytics;
  const originalGetExpenseStats = expenseRepository.getExpenseStats;

  afterEach(() => {
    vehicleRepository.getVehicleAnalytics = originalGetVehicleAnalytics;
    expenseRepository.getExpenseStats = originalGetExpenseStats;
  });

  it('passes the context argument through to getVehicleAnalytics -- regression guard for the dropped-context bug', async () => {
    const context = makeScopedContext([HARARE_BRANCH]);
    const dateRange = { startDate: new Date('2026-01-01'), endDate: new Date('2026-02-01') };

    let capturedContext: TenantContext | undefined;
    vehicleRepository.getVehicleAnalytics = jest.fn(async (_tenantId, _start, _end, ctx) => {
      capturedContext = ctx;
      return [];
    }) as any;
    expenseRepository.getExpenseStats = jest.fn(async () => ({
      total: 0,
      byType: {},
    })) as any;

    await fleetAnalyticsService.getCostBreakdown(TENANT, dateRange, context);

    expect(capturedContext).toBe(context);
  });
});
