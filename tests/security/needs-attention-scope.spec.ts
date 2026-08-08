// tests/security/needs-attention-scope.spec.ts
//
// needsAttentionService.getFeed() adds no new reads of its own -- it
// only calls the five already-scoped AI services plus
// complianceService/maintenanceQueryService and combines what they
// return (see the file header in needs-attention.service.ts). So the
// property worth proving here is not "does it filter by org unit"
// (that's each source's own test's job, e.g. fuel-fraud-scope.spec.ts)
// but:
//   1. the caller's TenantContext is actually threaded to every source
//      call, not dropped on the way through the aggregator;
//   2. one source throwing doesn't blank the whole feed (failure
//      isolation), and the failed source is reported rather than
//      silently hidden;
//   3. the combined feed is sorted by priorityScore, so a critical item
//      always outranks a low one regardless of which source produced
//      either.

import { needsAttentionService } from '../../modules/ai/services/needs-attention.service';
import { predictiveMaintenanceService } from '../../modules/ai/services/predictive-maintenance.service';
import { fleetHealthService } from '../../modules/ai/services/fleet-health.service';
import { driverRiskService } from '../../modules/ai/services/driver-risk.service';
import { fuelFraudDetectionService } from '../../modules/ai/services/fuel-fraud-detection.service';
import { expenseAnomalyDetectionService } from '../../modules/ai/services/expense-anomaly-detection.service';
import { complianceService } from '../../modules/compliance/services/compliance.service';
import { maintenanceQueryService } from '../../modules/maintenance/services/maintenance-query.service';
import { TenantContext } from '../../modules/tenancy/services/tenant-context.service';

jest.mock('../../modules/ai/services/predictive-maintenance.service', () => ({
  predictiveMaintenanceService: { predictAll: jest.fn() },
}));
jest.mock('../../modules/ai/services/fleet-health.service', () => ({
  fleetHealthService: { calculateHealthScore: jest.fn() },
}));
jest.mock('../../modules/ai/services/driver-risk.service', () => ({
  driverRiskService: { calculateDriverRisk: jest.fn() },
}));
jest.mock('../../modules/ai/services/fuel-fraud-detection.service', () => ({
  fuelFraudDetectionService: { detectFraud: jest.fn() },
}));
jest.mock('../../modules/ai/services/expense-anomaly-detection.service', () => ({
  expenseAnomalyDetectionService: { detectAnomalies: jest.fn() },
}));
jest.mock('../../modules/compliance/services/compliance.service', () => ({
  complianceService: { listRules: jest.fn(), listInScope: jest.fn(), list: jest.fn() },
}));
// jest.mock factories run before the module-level `emptyPage` const below
// is initialized, so default resolved values for listInScope/list are set
// in beforeEach instead (see below) rather than here.
jest.mock('../../modules/maintenance/services/maintenance-query.service', () => ({
  maintenanceQueryService: { getOverdueReminders: jest.fn(), getUpcomingReminders: jest.fn() },
}));

const mockedPredictAll = predictiveMaintenanceService.predictAll as jest.Mock;
const mockedHealthScore = fleetHealthService.calculateHealthScore as jest.Mock;
const mockedDriverRisk = driverRiskService.calculateDriverRisk as jest.Mock;
const mockedFuelFraud = fuelFraudDetectionService.detectFraud as jest.Mock;
const mockedExpenseAnomalies = expenseAnomalyDetectionService.detectAnomalies as jest.Mock;
const mockedListRules = complianceService.listRules as jest.Mock;
const mockedListInScope = complianceService.listInScope as jest.Mock;
const mockedList = complianceService.list as jest.Mock;
const mockedGetOverdue = maintenanceQueryService.getOverdueReminders as jest.Mock;
const mockedGetUpcoming = maintenanceQueryService.getUpcomingReminders as jest.Mock;

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

const emptyBatch = { success: true, results: [], total: 0, succeeded: 0, failed: 0, timestamp: new Date() };
const emptyPage = { data: [], pagination: { page: 1, limit: 200, total: 0, totalPages: 0, hasNext: false, hasPrev: false } };

describe('needsAttentionService.getFeed', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedPredictAll.mockResolvedValue(emptyBatch);
    mockedHealthScore.mockResolvedValue({ success: true, data: null, timestamp: new Date() });
    mockedDriverRisk.mockResolvedValue(emptyBatch);
    mockedFuelFraud.mockResolvedValue(emptyBatch);
    mockedExpenseAnomalies.mockResolvedValue(emptyBatch);
    mockedListRules.mockResolvedValue([]);
    mockedListInScope.mockResolvedValue(emptyPage);
    mockedList.mockResolvedValue(emptyPage);
    mockedGetOverdue.mockResolvedValue([]);
    mockedGetUpcoming.mockResolvedValue([]);
  });

  it('threads the caller TenantContext to every scoped source', async () => {
    const context = makeScopedContext([HARARE_BRANCH]);

    await needsAttentionService.getFeed(TENANT, context);

    expect(mockedPredictAll).toHaveBeenCalledWith(TENANT, context);
    expect(mockedHealthScore).toHaveBeenCalledWith(TENANT, context);
    expect(mockedDriverRisk).toHaveBeenCalledWith(TENANT, context);
    expect(mockedFuelFraud).toHaveBeenCalledWith(TENANT, context);
    expect(mockedExpenseAnomalies).toHaveBeenCalledWith(TENANT, context);
    // Scoped callers must go through listInScope, never the unscoped list().
    expect(mockedListInScope).toHaveBeenCalledWith(undefined, undefined, { page: 1, limit: 200 }, context);
    expect(mockedGetOverdue).toHaveBeenCalledWith(TENANT, context);
    expect(mockedGetUpcoming).toHaveBeenCalledWith(TENANT, 14, context);
  });

  it('an org-wide caller (no context) reads compliance via list(), not listInScope()', async () => {
    await needsAttentionService.getFeed(TENANT, undefined);

    expect(mockedList).toHaveBeenCalledWith(undefined, undefined, { page: 1, limit: 200 }, TENANT);
    expect(mockedListInScope).not.toHaveBeenCalled();
  });

  it('one source throwing does not blank the feed, and is reported in unavailableSources', async () => {
    mockedDriverRisk.mockRejectedValue(new Error('boom'));
    mockedGetOverdue.mockResolvedValue([
      {
        _id: 'reminder-1',
        license_plate: 'HRE1234',
        title: 'Brake service',
        due_date: new Date('2026-01-01'),
        status: 'overdue',
        estimated_cost: 500,
      },
    ]);

    const feed = await needsAttentionService.getFeed(TENANT);

    expect(feed.unavailableSources).toContain('driver_risk');
    expect(feed.items.length).toBe(1);
    expect(feed.items[0].source).toBe('maintenance');
    expect(feed.bySource.driver_risk).toBe(0);
  });

  it('ranks a critical item above a low-severity item regardless of source', async () => {
    mockedGetOverdue.mockResolvedValue([
      {
        _id: 'reminder-overdue',
        license_plate: 'HRE1234',
        title: 'Engine service',
        due_date: new Date('2026-01-01'),
        status: 'overdue',
        estimated_cost: 1000,
      },
    ]);
    mockedGetUpcoming.mockResolvedValue([
      {
        _id: 'reminder-upcoming',
        license_plate: 'BYO5678',
        title: 'Tire rotation',
        due_date: new Date('2026-02-01'),
        status: 'scheduled',
        estimated_cost: 50,
      },
    ]);

    const feed = await needsAttentionService.getFeed(TENANT);

    expect(feed.items.length).toBe(2);
    expect(feed.items[0].severity).toBe('critical');
    expect(feed.items[0].priorityScore).toBeGreaterThan(feed.items[1].priorityScore);
    // Sorted descending by priorityScore across the whole combined list.
    for (let i = 1; i < feed.items.length; i++) {
      expect(feed.items[i - 1].priorityScore).toBeGreaterThanOrEqual(feed.items[i].priorityScore);
    }
  });

  it('respects the limit parameter without changing bySource/bySeverity totals', async () => {
    mockedGetOverdue.mockResolvedValue(
      Array.from({ length: 5 }, (_, i) => ({
        _id: `reminder-${i}`,
        license_plate: `PLATE${i}`,
        title: 'Service',
        due_date: new Date('2026-01-01'),
        status: 'overdue',
        estimated_cost: 100,
      }))
    );

    const feed = await needsAttentionService.getFeed(TENANT, undefined, 2);

    expect(feed.items.length).toBe(2);
    expect(feed.total).toBe(5);
    expect(feed.bySource.maintenance).toBe(5);
  });
});