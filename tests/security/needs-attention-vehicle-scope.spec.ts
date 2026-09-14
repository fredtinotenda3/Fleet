// tests/security/needs-attention-vehicle-scope.spec.ts
//
// WAVE 1 PART 2, item 7: NeedsAttentionService.getFeedForVehicle --
// the Vehicle Detail page's vehicle-scoped Needs-Attention integration.
//
// THE PROPERTY THIS SUITE EXISTS TO PROVE, PER THE BRIEF THAT SHAPED
// ITEM 7: "an unauthorized vehicle/entity cannot be queried merely by
// changing the identifier." Concretely: a caller whose TenantContext
// does not cover the target vehicle's org unit must get the exact same
// NotFoundError a nonexistent vehicleId would produce -- not an empty
// feed (which would confirm the vehicle exists) and never that
// vehicle's real items.
//
// Everything downstream of that gate is also covered:
//   - authorization happens ONCE, before any of the four sources runs
//     (not per-source, not after a partial read);
//   - the caller's TenantContext is threaded to every source that
//     accepts one;
//   - maintenance reminders and work orders (which match by plate, not
//     by the authorization-checked vehicle _id) are narrowed to the
//     TRUE plate resolved from the authorized vehicle record, never a
//     client-supplied one -- getFeedForVehicle's signature has no
//     separate licensePlate parameter for exactly this reason;
//   - work orders are queried with exactLicensePlate: true, closing the
//     substring-leak defect pinned in
//     tests/regression/workorder-vehicle-plate-substring-leak.spec.ts;
//   - driver_risk, expense_anomaly and fleet_health are excluded (their
//     entityId cannot identify a vehicle) rather than guessed at;
//   - one source failing doesn't blank the others (failure isolation);
//   - this method never calls persistFeed() -- it must not overwrite
//     the fleet-wide persisted snapshot with a single-vehicle read.

import { needsAttentionService } from '../../modules/ai/services/needs-attention.service';
import { predictiveMaintenanceService } from '../../modules/ai/services/predictive-maintenance.service';
import { fuelFraudDetectionService } from '../../modules/ai/services/fuel-fraud-detection.service';
import { complianceService } from '../../modules/compliance/services/compliance.service';
import { maintenanceQueryService } from '../../modules/maintenance/services/maintenance-query.service';
import { workOrderRepository } from '../../modules/workorders/repositories/workorder.repository';
import { workOrderService } from '../../modules/workorders/services/workorder.service';
import { vehicleRepository } from '../../modules/vehicles/repositories/vehicle.repository';
import { NotFoundError } from '../../server/errors/app.errors';
import type { TenantContext } from '../../modules/tenancy/services/tenant-context.service';

jest.mock('../../modules/ai/services/predictive-maintenance.service', () => ({
  predictiveMaintenanceService: { predictVehicle: jest.fn() },
}));
jest.mock('../../modules/ai/services/fuel-fraud-detection.service', () => ({
  fuelFraudDetectionService: { detectVehicleFraud: jest.fn() },
}));
jest.mock('../../modules/compliance/services/compliance.service', () => ({
  complianceService: { listRules: jest.fn(), listOpenForEntityInScope: jest.fn() },
}));
jest.mock('../../modules/maintenance/services/maintenance-query.service', () => ({
  maintenanceQueryService: { getOverdueReminders: jest.fn(), getUpcomingReminders: jest.fn() },
}));
jest.mock('../../modules/workorders/repositories/workorder.repository', () => ({
  workOrderRepository: { getFilteredInScope: jest.fn() },
}));
jest.mock('../../modules/workorders/services/workorder.service', () => ({
  workOrderService: { list: jest.fn() },
}));
jest.mock('../../modules/vehicles/repositories/vehicle.repository', () => ({
  vehicleRepository: { findById: jest.fn() },
}));

const mockedPredictVehicle = predictiveMaintenanceService.predictVehicle as jest.Mock;
const mockedDetectVehicleFraud = fuelFraudDetectionService.detectVehicleFraud as jest.Mock;
const mockedListRules = complianceService.listRules as jest.Mock;
const mockedListOpenForEntityInScope = complianceService.listOpenForEntityInScope as jest.Mock;
const mockedGetOverdue = maintenanceQueryService.getOverdueReminders as jest.Mock;
const mockedGetUpcoming = maintenanceQueryService.getUpcomingReminders as jest.Mock;
const mockedGetFilteredInScope = workOrderRepository.getFilteredInScope as jest.Mock;
const mockedWorkOrderServiceList = workOrderService.list as jest.Mock;
const mockedFindById = vehicleRepository.findById as jest.Mock;

const TENANT = 'willsgrove-farm-enterprises-9e80ed';
const VEHICLE_ID = 'vehicle-hre123';
const PLATE = 'HRE123';
const HARARE_BRANCH = 'branch-harare';
const BULAWAYO_BRANCH = 'branch-bulawayo';

function harareScopedContext(): TenantContext {
  return {
    organizationId: TENANT,
    organizationName: 'Willsgrove Farm Enterprises',
    accessibleOrgUnitIds: [HARARE_BRANCH],
    assignedOrgUnitIds: [HARARE_BRANCH],
    isPlatformScope: false,
  } as TenantContext;
}

const emptyPage = { data: [], pagination: { page: 1, limit: 100, total: 0, totalPages: 0, hasNext: false, hasPrev: false } };
const notFound = { success: false, error: 'Vehicle not found', timestamp: new Date() };

describe('needsAttentionService.getFeedForVehicle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedPredictVehicle.mockResolvedValue(notFound);
    mockedDetectVehicleFraud.mockResolvedValue(notFound);
    mockedListRules.mockResolvedValue([]);
    mockedListOpenForEntityInScope.mockResolvedValue([]);
    mockedGetOverdue.mockResolvedValue([]);
    mockedGetUpcoming.mockResolvedValue([]);
    mockedGetFilteredInScope.mockResolvedValue(emptyPage);
    mockedWorkOrderServiceList.mockResolvedValue(emptyPage);
  });

  // ─── The core security property ──────────────────────────────────────

  it('a nonexistent vehicleId 404s via NotFoundError, before any source is read', async () => {
    mockedFindById.mockResolvedValue(null);

    await expect(
      needsAttentionService.getFeedForVehicle(TENANT, VEHICLE_ID, harareScopedContext())
    ).rejects.toThrow(NotFoundError);

    expect(mockedPredictVehicle).not.toHaveBeenCalled();
    expect(mockedDetectVehicleFraud).not.toHaveBeenCalled();
    expect(mockedListOpenForEntityInScope).not.toHaveBeenCalled();
    expect(mockedGetOverdue).not.toHaveBeenCalled();
    expect(mockedGetFilteredInScope).not.toHaveBeenCalled();
  });

  it('a vehicle that exists but is OUTSIDE the caller org-unit scope 404s identically -- cannot be reached by changing the id', async () => {
    mockedFindById.mockResolvedValue({
      _id: VEHICLE_ID,
      license_plate: PLATE,
      orgUnitId: BULAWAYO_BRANCH, // outside the caller's scope
    });

    const bulawayoOutcome = needsAttentionService.getFeedForVehicle(TENANT, VEHICLE_ID, harareScopedContext());
    await expect(bulawayoOutcome).rejects.toThrow(NotFoundError);
    await expect(bulawayoOutcome.catch((e) => e.message)).resolves.toBe('Vehicle not found');

    // Same message/type as the "doesn't exist at all" case above --
    // deliberately indistinguishable, so probing vehicleId values learns
    // nothing about which ones exist versus which ones are just out of
    // scope.
    mockedFindById.mockResolvedValue(null);
    const nonexistentOutcome = needsAttentionService.getFeedForVehicle(TENANT, 'no-such-vehicle', harareScopedContext());
    await expect(nonexistentOutcome.catch((e) => e.message)).resolves.toBe('Vehicle not found');

    expect(mockedPredictVehicle).not.toHaveBeenCalled();
    expect(mockedGetFilteredInScope).not.toHaveBeenCalled();
  });

  it('the SAME vehicle succeeds once the caller is scoped to its org unit', async () => {
    mockedFindById.mockResolvedValue({ _id: VEHICLE_ID, license_plate: PLATE, orgUnitId: HARARE_BRANCH });

    const feed = await needsAttentionService.getFeedForVehicle(TENANT, VEHICLE_ID, harareScopedContext());

    expect(feed.items).toEqual([]);
    expect(feed.unavailableSources).toEqual([]);
  });

  it('an org-wide caller (no context) is never blocked by the org-unit check, only by findById', async () => {
    mockedFindById.mockResolvedValue({ _id: VEHICLE_ID, license_plate: PLATE, orgUnitId: HARARE_BRANCH });

    await expect(
      needsAttentionService.getFeedForVehicle(TENANT, VEHICLE_ID, undefined)
    ).resolves.toBeDefined();
  });

  // ─── Authorization happens exactly once, before every source ─────────

  it('authorizes via vehicleRepository.findById scoped to tenantId, not a bare id lookup', async () => {
    mockedFindById.mockResolvedValue({ _id: VEHICLE_ID, license_plate: PLATE, orgUnitId: HARARE_BRANCH });

    await needsAttentionService.getFeedForVehicle(TENANT, VEHICLE_ID, harareScopedContext());

    expect(mockedFindById).toHaveBeenCalledWith(VEHICLE_ID, TENANT);
    expect(mockedFindById).toHaveBeenCalledTimes(1);
  });

  it('threads tenantId/context to predictVehicle and detectVehicleFraud using the AUTHORIZED vehicleId', async () => {
    mockedFindById.mockResolvedValue({ _id: VEHICLE_ID, license_plate: PLATE, orgUnitId: HARARE_BRANCH });
    const context = harareScopedContext();

    await needsAttentionService.getFeedForVehicle(TENANT, VEHICLE_ID, context);

    expect(mockedPredictVehicle).toHaveBeenCalledWith(VEHICLE_ID, TENANT, context);
    expect(mockedDetectVehicleFraud).toHaveBeenCalledWith(VEHICLE_ID, TENANT, context);
  });

  it('compliance is read via listOpenForEntityInScope(vehicle, vehicleId, context) -- a bounded query, not fetch-then-filter', async () => {
    mockedFindById.mockResolvedValue({ _id: VEHICLE_ID, license_plate: PLATE, orgUnitId: HARARE_BRANCH });
    const context = harareScopedContext();

    await needsAttentionService.getFeedForVehicle(TENANT, VEHICLE_ID, context);

    expect(mockedListOpenForEntityInScope).toHaveBeenCalledWith('vehicle', VEHICLE_ID, context);
    expect(mockedListRules).toHaveBeenCalledWith('vehicle', context.organizationId);
  });

  it('compliance fails closed (returns nothing) for an org-wide caller with no context, rather than reading unscoped', async () => {
    mockedFindById.mockResolvedValue({ _id: VEHICLE_ID, license_plate: PLATE, orgUnitId: HARARE_BRANCH });
    mockedListOpenForEntityInScope.mockResolvedValue([
      { _id: 'rec-1', ruleId: 'rule-1', entityType: 'vehicle', entityId: VEHICLE_ID, dueDate: new Date(), status: 'overdue' },
    ]);

    const feed = await needsAttentionService.getFeedForVehicle(TENANT, VEHICLE_ID, undefined);

    expect(mockedListOpenForEntityInScope).not.toHaveBeenCalled();
    expect(feed.bySource.compliance).toBe(0);
  });

  it('work orders are queried with exactLicensePlate: true, using the plate resolved from the AUTHORIZED vehicle record', async () => {
    mockedFindById.mockResolvedValue({ _id: VEHICLE_ID, license_plate: PLATE, orgUnitId: HARARE_BRANCH });
    const context = harareScopedContext();

    await needsAttentionService.getFeedForVehicle(TENANT, VEHICLE_ID, context);

    expect(mockedGetFilteredInScope).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'open', license_plate: PLATE, exactLicensePlate: true }),
      context,
      expect.any(Object)
    );
  });

  it('maintenance reminders are narrowed to this vehicle\'s plate, excluding another vehicle\'s reminder in the same (already scoped) result set', async () => {
    mockedFindById.mockResolvedValue({ _id: VEHICLE_ID, license_plate: PLATE, orgUnitId: HARARE_BRANCH });
    mockedGetOverdue.mockResolvedValue([
      { _id: 'reminder-mine', license_plate: PLATE, title: 'Brake service', due_date: new Date('2026-01-01'), status: 'overdue', estimated_cost: 500, orgUnitId: HARARE_BRANCH },
      { _id: 'reminder-other', license_plate: 'BYO9999', title: 'Oil change', due_date: new Date('2026-01-01'), status: 'overdue', estimated_cost: 80, orgUnitId: HARARE_BRANCH },
    ]);

    const feed = await needsAttentionService.getFeedForVehicle(TENANT, VEHICLE_ID, harareScopedContext());

    expect(feed.items.length).toBe(1);
    expect(feed.items[0].entityLabel).toBe(PLATE);
  });

  // ─── Excluded sources ──────────────────────────────────────────────

  it('never contributes driver_risk, expense_anomaly or fleet_health items -- their entityId cannot identify a vehicle', async () => {
    mockedFindById.mockResolvedValue({ _id: VEHICLE_ID, license_plate: PLATE, orgUnitId: HARARE_BRANCH });

    const feed = await needsAttentionService.getFeedForVehicle(TENANT, VEHICLE_ID, harareScopedContext());

    expect(feed.bySource.driver_risk).toBe(0);
    expect(feed.bySource.expense_anomaly).toBe(0);
    expect(feed.bySource.fleet_health).toBe(0);
    expect(feed.items.every((item) => item.source !== 'driver_risk')).toBe(true);
  });

  // ─── Failure isolation ─────────────────────────────────────────────

  it('one source throwing does not blank the others, and is reported in unavailableSources', async () => {
    mockedFindById.mockResolvedValue({ _id: VEHICLE_ID, license_plate: PLATE, orgUnitId: HARARE_BRANCH });
    mockedDetectVehicleFraud.mockRejectedValue(new Error('telematics timeout'));
    mockedGetOverdue.mockResolvedValue([
      { _id: 'reminder-1', license_plate: PLATE, title: 'Brake service', due_date: new Date('2026-01-01'), status: 'overdue', estimated_cost: 500, orgUnitId: HARARE_BRANCH },
    ]);

    const feed = await needsAttentionService.getFeedForVehicle(TENANT, VEHICLE_ID, harareScopedContext());

    expect(feed.unavailableSources).toContain('fuel_fraud');
    expect(feed.items.length).toBe(1);
    expect(feed.items[0].source).toBe('maintenance');
  });

  // ─── Sorting ───────────────────────────────────────────────────────

  it('sorts the combined items by priorityScore, highest first', async () => {
    mockedFindById.mockResolvedValue({ _id: VEHICLE_ID, license_plate: PLATE, orgUnitId: HARARE_BRANCH });
    mockedGetOverdue.mockResolvedValue([
      { _id: 'reminder-overdue', license_plate: PLATE, title: 'Engine service', due_date: new Date('2026-01-01'), status: 'overdue', estimated_cost: 1000, orgUnitId: HARARE_BRANCH },
    ]);
    mockedGetUpcoming.mockResolvedValue([
      { _id: 'reminder-upcoming', license_plate: PLATE, title: 'Tire rotation', due_date: new Date('2026-02-01'), status: 'scheduled', estimated_cost: 50, orgUnitId: HARARE_BRANCH },
    ]);

    const feed = await needsAttentionService.getFeedForVehicle(TENANT, VEHICLE_ID, harareScopedContext());

    expect(feed.items.length).toBe(2);
    for (let i = 1; i < feed.items.length; i++) {
      expect(feed.items[i - 1].priorityScore).toBeGreaterThanOrEqual(feed.items[i].priorityScore);
    }
  });

  // ─── No persistence side effect ────────────────────────────────────

  it('does not call persistFeed -- a single-vehicle read must not overwrite the fleet-wide persisted snapshot', async () => {
    mockedFindById.mockResolvedValue({ _id: VEHICLE_ID, license_plate: PLATE, orgUnitId: HARARE_BRANCH });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- persistFeed is private; spying on it is the only way to assert it was not invoked.
    const persistSpy = jest.spyOn(needsAttentionService as any, 'persistFeed');

    await needsAttentionService.getFeedForVehicle(TENANT, VEHICLE_ID, harareScopedContext());

    expect(persistSpy).not.toHaveBeenCalled();
    persistSpy.mockRestore();
  });

  // ─── Limit behavior ────────────────────────────────────────────────

  it('respects the limit parameter without changing bySource/total', async () => {
    mockedFindById.mockResolvedValue({ _id: VEHICLE_ID, license_plate: PLATE, orgUnitId: HARARE_BRANCH });
    mockedGetOverdue.mockResolvedValue(
      Array.from({ length: 5 }, (_, i) => ({
        _id: `reminder-${i}`,
        license_plate: PLATE,
        title: 'Service',
        due_date: new Date('2026-01-01'),
        status: 'overdue',
        estimated_cost: 100,
        orgUnitId: HARARE_BRANCH,
      }))
    );

    const feed = await needsAttentionService.getFeedForVehicle(TENANT, VEHICLE_ID, harareScopedContext(), 2);

    expect(feed.items.length).toBe(2);
    expect(feed.total).toBe(5);
    expect(feed.bySource.maintenance).toBe(5);
  });
});
