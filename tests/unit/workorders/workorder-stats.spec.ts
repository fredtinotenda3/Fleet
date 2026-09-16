// tests/unit/workorders/workorder-stats.spec.ts
//
// WAVE 3, R.3.6 -- Work Order Reporting.
//
// Pins WorkOrderRepository.getStatsInScope: the query it builds (tenant
// scope, org-unit scope, date-range filter on openedAt) and the way it
// maps a raw $facet result into WorkOrderStats -- in particular the
// zero-filling of status/priority/source categories (a real "0 matches"
// fact, not a fabricated one) and the turnaround average's null-vs-0
// distinction (never claim a measured average from zero qualifying
// records).
//
// No live Mongo in this sandbox -- `getCollection` is spied to return a
// fake collection whose `aggregate()` captures the pipeline it was
// given and returns a canned $facet result, mirroring the mocking
// convention tests/regression/workorder-vehicle-plate-substring-leak.spec.ts
// already established for this same repository.

import { workOrderRepository } from '../../../modules/workorders/repositories/workorder.repository';
import type { TenantContext } from '../../../modules/tenancy/services/tenant-context.service';

const ORG = 'willsgrove-farm-enterprises-9e80ed';

const ORG_WIDE_CONTEXT: TenantContext = {
  organizationId: ORG,
  organizationName: 'Willsgrove Farm Enterprises',
  accessibleOrgUnitIds: null,
  isPlatformScope: false,
  assignedOrgUnitIds: [],
};

const SCOPED_CONTEXT: TenantContext = {
  organizationId: ORG,
  organizationName: 'Willsgrove Farm Enterprises',
  accessibleOrgUnitIds: ['unit-harare'],
  isPlatformScope: false,
  assignedOrgUnitIds: ['unit-harare'],
};

const FAIL_CLOSED_CONTEXT: TenantContext = {
  organizationId: ORG,
  organizationName: 'Willsgrove Farm Enterprises',
  accessibleOrgUnitIds: [],
  isPlatformScope: false,
  assignedOrgUnitIds: [],
};

/** Empty facet -- every branch defaults to its zero-record shape. */
const EMPTY_FACET = {
  totalCount: [],
  statusCounts: [],
  priorityCounts: [],
  sourceCounts: [],
  assignment: [],
  cost: [],
  turnaround: [],
  completedMissingTimestamps: [],
  byWorkshop: [],
};

function mockAggregateCollection(facetResult: Record<string, unknown>) {
  const calls: { pipeline?: unknown[] } = {};
  const collection = {
    aggregate: (pipeline: unknown[]) => {
      calls.pipeline = pipeline;
      return { toArray: async () => [facetResult] };
    },
  };
  return { collection, calls };
}

describe('WorkOrderRepository.getStatsInScope: query construction', () => {
  afterEach(() => jest.restoreAllMocks());

  it('scopes by tenant (organizationId) unconditionally', async () => {
    const { collection, calls } = mockAggregateCollection(EMPTY_FACET);
    jest.spyOn(workOrderRepository as any, 'getCollection').mockResolvedValue(collection);

    await workOrderRepository.getStatsInScope(ORG_WIDE_CONTEXT);

    const matchStage = (calls.pipeline as any[])[0].$match;
    expect(matchStage.tenantId).toBe(ORG);
    expect(matchStage.isDeleted).toEqual({ $ne: true });
  });

  it('org-wide context (accessibleOrgUnitIds: null) adds no orgUnitId restriction', async () => {
    const { collection, calls } = mockAggregateCollection(EMPTY_FACET);
    jest.spyOn(workOrderRepository as any, 'getCollection').mockResolvedValue(collection);

    await workOrderRepository.getStatsInScope(ORG_WIDE_CONTEXT);

    const matchStage = (calls.pipeline as any[])[0].$match;
    expect(matchStage.orgUnitId).toBeUndefined();
  });

  it('a scoped context restricts to the caller\'s own org units', async () => {
    const { collection, calls } = mockAggregateCollection(EMPTY_FACET);
    jest.spyOn(workOrderRepository as any, 'getCollection').mockResolvedValue(collection);

    await workOrderRepository.getStatsInScope(SCOPED_CONTEXT);

    const matchStage = (calls.pipeline as any[])[0].$match;
    expect(matchStage.orgUnitId).toEqual({ $in: ['unit-harare'] });
  });

  it('fails closed for a scoped caller with no accessible units (matches nothing, not everything)', async () => {
    const { collection, calls } = mockAggregateCollection(EMPTY_FACET);
    jest.spyOn(workOrderRepository as any, 'getCollection').mockResolvedValue(collection);

    await workOrderRepository.getStatsInScope(FAIL_CLOSED_CONTEXT);

    const matchStage = (calls.pipeline as any[])[0].$match;
    expect(matchStage.orgUnitId).toEqual({ $in: [] });
  });

  it('a supplied date range filters on openedAt with inclusive bounds', async () => {
    const { collection, calls } = mockAggregateCollection(EMPTY_FACET);
    jest.spyOn(workOrderRepository as any, 'getCollection').mockResolvedValue(collection);

    const startDate = new Date('2026-09-01T00:00:00.000Z');
    const endDate = new Date('2026-09-15T23:59:59.999Z');
    await workOrderRepository.getStatsInScope(ORG_WIDE_CONTEXT, { startDate, endDate });

    const matchStage = (calls.pipeline as any[])[0].$match;
    expect(matchStage.openedAt).toEqual({ $gte: startDate, $lte: endDate });
  });

  it('no date range means no openedAt restriction at all (not an accidental all-time-zero window)', async () => {
    const { collection, calls } = mockAggregateCollection(EMPTY_FACET);
    jest.spyOn(workOrderRepository as any, 'getCollection').mockResolvedValue(collection);

    await workOrderRepository.getStatsInScope(ORG_WIDE_CONTEXT);

    const matchStage = (calls.pipeline as any[])[0].$match;
    expect(matchStage.openedAt).toBeUndefined();
  });
});

describe('WorkOrderRepository.getStatsInScope: result mapping (data truth)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('genuine zero: no matching work orders at all -- every count is a real 0, turnaround is null (not 0)', async () => {
    const { collection } = mockAggregateCollection(EMPTY_FACET);
    jest.spyOn(workOrderRepository as any, 'getCollection').mockResolvedValue(collection);

    const stats = await workOrderRepository.getStatsInScope(ORG_WIDE_CONTEXT);

    expect(stats.totalCount).toBe(0);
    expect(stats.statusCounts).toEqual({ open: 0, assigned: 0, in_progress: 0, on_hold: 0, completed: 0, cancelled: 0 });
    expect(stats.priorityCounts).toEqual({ low: 0, medium: 0, high: 0, critical: 0 });
    expect(stats.sourceCounts).toEqual({ manual: 0, dvir: 0, reminder: 0 });
    expect(stats.assignedCount).toBe(0);
    expect(stats.unassignedCount).toBe(0);
    expect(stats.totalCost).toBe(0);
    expect(stats.turnaround.averageHours).toBeNull();
    expect(stats.turnaround.sampleSize).toBe(0);
    expect(stats.byWorkshop).toEqual([]);
  });

  it('status/priority/source counts are zero-filled for every known category, not just the ones with matches', async () => {
    const { collection } = mockAggregateCollection({
      ...EMPTY_FACET,
      totalCount: [{ count: 3 }],
      statusCounts: [{ _id: 'open', count: 2 }, { _id: 'completed', count: 1 }],
      priorityCounts: [{ _id: 'high', count: 3 }],
      sourceCounts: [{ _id: 'dvir', count: 3 }],
    });
    jest.spyOn(workOrderRepository as any, 'getCollection').mockResolvedValue(collection);

    const stats = await workOrderRepository.getStatsInScope(ORG_WIDE_CONTEXT);

    // Present categories carry their real count...
    expect(stats.statusCounts.open).toBe(2);
    expect(stats.statusCounts.completed).toBe(1);
    // ...absent categories are a genuine 0, not missing from the object.
    expect(stats.statusCounts.assigned).toBe(0);
    expect(stats.statusCounts.in_progress).toBe(0);
    expect(stats.statusCounts.on_hold).toBe(0);
    expect(stats.statusCounts.cancelled).toBe(0);
    expect(stats.priorityCounts).toEqual({ low: 0, medium: 0, high: 3, critical: 0 });
    expect(stats.sourceCounts).toEqual({ manual: 0, dvir: 3, reminder: 0 });
  });

  it('unavailable, not zero: completed work orders exist but none have a recorded completedAt -- averageHours stays null', async () => {
    const { collection } = mockAggregateCollection({
      ...EMPTY_FACET,
      totalCount: [{ count: 2 }],
      statusCounts: [{ _id: 'completed', count: 2 }],
      turnaround: [], // no qualifying rows made it past the completedAt $match
      completedMissingTimestamps: [{ count: 2 }],
    });
    jest.spyOn(workOrderRepository as any, 'getCollection').mockResolvedValue(collection);

    const stats = await workOrderRepository.getStatsInScope(ORG_WIDE_CONTEXT);

    expect(stats.turnaround.averageHours).toBeNull();
    expect(stats.turnaround.sampleSize).toBe(0);
    expect(stats.turnaround.completedMissingTimestamps).toBe(2);
  });

  it('a genuine average is only reported when at least one completed work order has a completedAt', async () => {
    const { collection } = mockAggregateCollection({
      ...EMPTY_FACET,
      totalCount: [{ count: 4 }],
      statusCounts: [{ _id: 'completed', count: 3 }, { _id: 'open', count: 1 }],
      turnaround: [{ averageHours: 26.5, sampleSize: 2 }],
      completedMissingTimestamps: [{ count: 1 }],
    });
    jest.spyOn(workOrderRepository as any, 'getCollection').mockResolvedValue(collection);

    const stats = await workOrderRepository.getStatsInScope(ORG_WIDE_CONTEXT);

    expect(stats.turnaround.averageHours).toBe(26.5);
    expect(stats.turnaround.sampleSize).toBe(2);
    // Discloses partial coverage rather than silently presenting the
    // average as if it covered every completed work order.
    expect(stats.turnaround.completedMissingTimestamps).toBe(1);
  });

  it('totalCost sums the real totalCost field -- a genuine 0 for a freshly-opened work order is not "cost unavailable"', async () => {
    const { collection } = mockAggregateCollection({
      ...EMPTY_FACET,
      totalCount: [{ count: 2 }],
      cost: [{ totalCost: 0 }],
    });
    jest.spyOn(workOrderRepository as any, 'getCollection').mockResolvedValue(collection);

    const stats = await workOrderRepository.getStatsInScope(ORG_WIDE_CONTEXT);
    expect(stats.totalCost).toBe(0);
  });

  it('byWorkshop reports a work order with no orgUnitId as null, never a fabricated branch name', async () => {
    const { collection } = mockAggregateCollection({
      ...EMPTY_FACET,
      byWorkshop: [
        { orgUnitId: 'unit-harare', orgUnitName: 'Harare Workshop', count: 5 },
        { orgUnitId: null, orgUnitName: null, count: 1 },
      ],
    });
    jest.spyOn(workOrderRepository as any, 'getCollection').mockResolvedValue(collection);

    const stats = await workOrderRepository.getStatsInScope(ORG_WIDE_CONTEXT);
    expect(stats.byWorkshop).toEqual([
      { orgUnitId: 'unit-harare', orgUnitName: 'Harare Workshop', count: 5 },
      { orgUnitId: null, orgUnitName: null, count: 1 },
    ]);
  });

  it('assignedCount/unassignedCount reflect the real assignment split (technician attribution, no guessing)', async () => {
    const { collection } = mockAggregateCollection({
      ...EMPTY_FACET,
      assignment: [{ assigned: 4, unassigned: 2 }],
    });
    jest.spyOn(workOrderRepository as any, 'getCollection').mockResolvedValue(collection);

    const stats = await workOrderRepository.getStatsInScope(ORG_WIDE_CONTEXT);
    expect(stats.assignedCount).toBe(4);
    expect(stats.unassignedCount).toBe(2);
  });
});
