// tests/unit/workorders/workorder-service-stats.spec.ts
//
// WAVE 3, R.3.6 -- Work Order Reporting.
//
// Pins WorkOrderService.getStats: it must delegate scoping entirely to
// the repository (no re-derivation of tenant/org-unit scope in the
// service layer -- that would risk drifting from buildScopedQuery) and
// must correctly derive the "operationally open" bucket (open +
// assigned + in_progress + on_hold) from the repository's per-status
// counts.

import { WorkOrderService } from '../../../modules/workorders/services/workorder.service';
import type { WorkOrderStats } from '../../../modules/workorders/repositories/workorder.repository';
import type { TenantContext } from '../../../modules/tenancy/services/tenant-context.service';

const ORG = 'willsgrove-farm-enterprises-9e80ed';
const CONTEXT: TenantContext = {
  organizationId: ORG,
  organizationName: 'Willsgrove Farm Enterprises',
  accessibleOrgUnitIds: null,
  isPlatformScope: false,
  assignedOrgUnitIds: [],
};

const BASE_STATS: WorkOrderStats = {
  totalCount: 10,
  statusCounts: { open: 2, assigned: 1, in_progress: 3, on_hold: 1, completed: 2, cancelled: 1 },
  priorityCounts: { low: 4, medium: 3, high: 2, critical: 1 },
  sourceCounts: { manual: 6, dvir: 3, reminder: 1 },
  assignedCount: 7,
  unassignedCount: 3,
  totalCost: 1500,
  turnaround: { averageHours: 12.5, sampleSize: 2, completedMissingTimestamps: 0 },
  byWorkshop: [{ orgUnitId: 'unit-harare', orgUnitName: 'Harare Workshop', count: 10 }],
};

describe('WorkOrderService.getStats', () => {
  it('delegates to the repository with the exact context and date range it received', async () => {
    const getStatsInScope = jest.fn(async () => BASE_STATS);
    const service = new WorkOrderService({ getStatsInScope } as any);

    const dateRange = { startDate: new Date('2026-09-01'), endDate: new Date('2026-09-15') };
    await service.getStats(CONTEXT, dateRange);

    expect(getStatsInScope).toHaveBeenCalledWith(CONTEXT, dateRange);
  });

  it('derives openCount as open + assigned + in_progress + on_hold', async () => {
    const service = new WorkOrderService({ getStatsInScope: async () => BASE_STATS } as any);
    const result = await service.getStats(CONTEXT);
    expect(result.openCount).toBe(2 + 1 + 3 + 1);
  });

  it('completedCount/cancelledCount mirror the repository statusCounts directly', async () => {
    const service = new WorkOrderService({ getStatsInScope: async () => BASE_STATS } as any);
    const result = await service.getStats(CONTEXT);
    expect(result.completedCount).toBe(2);
    expect(result.cancelledCount).toBe(1);
  });

  it('a genuinely empty scope (zero work orders) derives openCount 0, not a fabricated figure', async () => {
    const empty: WorkOrderStats = {
      ...BASE_STATS,
      totalCount: 0,
      statusCounts: { open: 0, assigned: 0, in_progress: 0, on_hold: 0, completed: 0, cancelled: 0 },
    };
    const service = new WorkOrderService({ getStatsInScope: async () => empty } as any);
    const result = await service.getStats(CONTEXT);
    expect(result.openCount).toBe(0);
    expect(result.completedCount).toBe(0);
    expect(result.cancelledCount).toBe(0);
  });

  it('passes every other repository field through unchanged (no re-derivation of cost/turnaround/byWorkshop)', async () => {
    const service = new WorkOrderService({ getStatsInScope: async () => BASE_STATS } as any);
    const result = await service.getStats(CONTEXT);
    expect(result.totalCost).toBe(BASE_STATS.totalCost);
    expect(result.turnaround).toEqual(BASE_STATS.turnaround);
    expect(result.byWorkshop).toEqual(BASE_STATS.byWorkshop);
    expect(result.assignedCount).toBe(BASE_STATS.assignedCount);
    expect(result.unassignedCount).toBe(BASE_STATS.unassignedCount);
  });
});
