// tests/security/fleet-summary-financial-access.spec.ts
//
// WAVE 3, R.3.1 -- Fleet Summary Reporting.
//
// Pins two things about fleetAnalyticsService.getFleetKPIs, the source
// behind the Executive Dashboard's ("Fleet Summary") headline KPI grid:
//
//   1. FINANCIAL FIELD REDACTION (the security-relevant fix). Before this
//      delivery the endpoint behind this (app/api/analytics -> action=kpis)
//      was gated only by Permission.ANALYTICS_VIEW, and returned
//      totalExpenses/totalFuelCost/costPerKm to EVERY caller holding it --
//      including WORKSHOP_MANAGER, a real role in server/permissions/
//      roles.ts that holds ANALYTICS_VIEW + REPORT_VIEW but neither
//      EXPENSE_VIEW nor FUEL_VIEW. `hasFinancialAccess` is now a mandatory
//      (no-default) parameter precisely so a future call site cannot
//      silently fail open by omitting it -- these tests exercise both
//      branches directly against the service, matching the mocking
//      convention tests/security/vehicle-analytics-scope.spec.ts already
//      established for this same service (monkey-patch the repository
//      singletons, restore in afterEach).
//
//   2. DATE-RANGE THREADING (already correct end-to-end; this suite adds
//      the regression guard). getFleetKPIs forwards `dateRange` to
//      expenseRepository/fuelRepository/tripRepository's *Stats methods,
//      which build a real $match stage on it (see expense.repository.ts).
//      The gap R.3.1 found was entirely on the frontend (ExecutiveDashboard
//      calling useFleetKPIs() with no argument at all) -- see
//      tests/unit/reports/executive-dashboard-wiring.spec.ts for that half.

import { fleetAnalyticsService } from '../../modules/analytics/services/fleet-analytics.service';
import { vehicleRepository } from '../../modules/vehicles/repositories/vehicle.repository';
import { expenseRepository } from '../../modules/expenses/repositories/expense.repository';
import { fuelRepository } from '../../modules/fuel/repositories/fuel.repository';
import { maintenanceRepository } from '../../modules/maintenance/repositories/maintenance.repository';
import { tripRepository } from '../../modules/trips/repositories/trip.repository';
import { Role, rolePermissions, Permission } from '../../server/permissions/roles';
import { hasAnyPermission, AuthContext } from '../../server/auth/auth-context';

const TENANT = 'willsgrove-farm-enterprises-9e80ed';

const originals = {
  getVehicleStats: vehicleRepository.getVehicleStats,
  getExpenseStats: expenseRepository.getExpenseStats,
  getFuelStats: fuelRepository.getFuelStats,
  getMaintenanceStats: maintenanceRepository.getMaintenanceStats,
  getTripStats: tripRepository.getTripStats,
};

function mockRepositories(capture?: { dateRangeSeen?: unknown[] }) {
  vehicleRepository.getVehicleStats = jest.fn(async () => ({ total: 10, active: 7, maintenance: 2 })) as any;
  expenseRepository.getExpenseStats = jest.fn(async (_t, dateRange) => {
    capture?.dateRangeSeen?.push(dateRange);
    return { total: 5000, byType: {} };
  }) as any;
  fuelRepository.getFuelStats = jest.fn(async (_t, dateRange) => {
    capture?.dateRangeSeen?.push(dateRange);
    return { totalFuel: 1000, totalCost: 3000 };
  }) as any;
  maintenanceRepository.getMaintenanceStats = jest.fn(async () => ({
    pending: 3,
    overdue: 1,
    completionRate: 0.8,
  })) as any;
  tripRepository.getTripStats = jest.fn(async (_t, dateRange) => {
    capture?.dateRangeSeen?.push(dateRange);
    return { totalDistance: 20000, totalTrips: 40 };
  }) as any;
}

describe('getFleetKPIs: financial fields are withheld server-side when the caller lacks financial view access', () => {
  afterEach(() => {
    vehicleRepository.getVehicleStats = originals.getVehicleStats;
    expenseRepository.getExpenseStats = originals.getExpenseStats;
    fuelRepository.getFuelStats = originals.getFuelStats;
    maintenanceRepository.getMaintenanceStats = originals.getMaintenanceStats;
    tripRepository.getTripStats = originals.getTripStats;
  });

  it('hasFinancialAccess=false: nulls totalExpenses/totalFuelCost/costPerKm and sets financialAccessRestricted', async () => {
    mockRepositories();

    const result = await fleetAnalyticsService.getFleetKPIs(TENANT, undefined, undefined, false);

    expect(result.totalExpenses).toBeNull();
    expect(result.totalFuelCost).toBeNull();
    expect(result.costPerKm).toBeNull();
    expect(result.financialAccessRestricted).toBe(true);
  });

  it('hasFinancialAccess=false: never restricts non-financial operational fields', async () => {
    mockRepositories();

    const result = await fleetAnalyticsService.getFleetKPIs(TENANT, undefined, undefined, false);

    // Vehicle composition, fuel volume/efficiency (a quantity, not a cost),
    // distance and maintenance counts are operational, not financial --
    // WORKSHOP_MANAGER is entitled to all of these.
    expect(result.totalVehicles).toBe(10);
    expect(result.activeVehicles).toBe(7);
    expect(result.maintenanceVehicles).toBe(2);
    expect(result.totalFuelVolume).toBe(1000);
    expect(result.totalDistance).toBe(20000);
    expect(result.averageFuelEfficiency).toBe(20); // 20000 / 1000
    expect(result.pendingMaintenance).toBe(3);
    expect(result.overdueMaintenance).toBe(1);
  });

  it('hasFinancialAccess=true: returns the real financial figures with financialAccessRestricted false', async () => {
    mockRepositories();

    const result = await fleetAnalyticsService.getFleetKPIs(TENANT, undefined, undefined, true);

    expect(result.totalExpenses).toBe(5000);
    expect(result.totalFuelCost).toBe(3000);
    expect(result.costPerKm).toBe((5000 + 3000) / 20000);
    expect(result.financialAccessRestricted).toBe(false);
  });

  it('forwards the dateRange argument to every *Stats call that supports it (regression guard)', async () => {
    const seen: unknown[] = [];
    mockRepositories({ dateRangeSeen: seen });
    const dateRange = { startDate: new Date('2026-09-01'), endDate: new Date('2026-09-15') };

    await fleetAnalyticsService.getFleetKPIs(TENANT, dateRange, undefined, true);

    // expenseRepository, fuelRepository, tripRepository each received it.
    expect(seen).toHaveLength(3);
    seen.forEach((r) => expect(r).toBe(dateRange));
  });
});

describe('getFleetKPIs: estimatedDistanceKm (provenance propagation for a no-GPS/no-odometer branch)', () => {
  afterEach(() => {
    vehicleRepository.getVehicleStats = originals.getVehicleStats;
    expenseRepository.getExpenseStats = originals.getExpenseStats;
    fuelRepository.getFuelStats = originals.getFuelStats;
    maintenanceRepository.getMaintenanceStats = originals.getMaintenanceStats;
    tripRepository.getTripStats = originals.getTripStats;
  });

  function mockRepositoriesWithTripStats(tripStats: Record<string, unknown>) {
    vehicleRepository.getVehicleStats = jest.fn(async () => ({ total: 1, active: 1, maintenance: 0 })) as any;
    expenseRepository.getExpenseStats = jest.fn(async () => ({ total: 0, byType: {} })) as any;
    fuelRepository.getFuelStats = jest.fn(async () => ({ totalFuel: 50, totalCost: 100 })) as any;
    maintenanceRepository.getMaintenanceStats = jest.fn(async () => ({
      pending: 0,
      overdue: 0,
      completionRate: null,
    })) as any;
    tripRepository.getTripStats = jest.fn(async () => tripStats) as any;
  }

  it('is 0 when TripStats carries no estimatedDistance (fully GPS/odometer-observed fleet)', async () => {
    mockRepositoriesWithTripStats({ totalDistance: 500, totalTrips: 5, estimatedDistance: 0 });

    const result = await fleetAnalyticsService.getFleetKPIs(TENANT, undefined, undefined, true);

    expect(result.estimatedDistanceKm).toBe(0);
  });

  it('defaults to 0 (never undefined/NaN) when a caller\'s TripStats predates this field entirely', async () => {
    // Exactly the shape the OTHER describe block in this file mocks --
    // `{ totalDistance, totalTrips }` with no distanceBySource/
    // estimatedDistance/observedDistance at all. getFleetKPIs must not
    // crash or propagate `undefined` into a numeric API field.
    mockRepositoriesWithTripStats({ totalDistance: 20000, totalTrips: 40 });

    const result = await fleetAnalyticsService.getFleetKPIs(TENANT, undefined, undefined, true);

    expect(result.estimatedDistanceKm).toBe(0);
  });

  it('equals the full totalDistance for a branch with zero GPS/odometer coverage (the Harare ABC123 scenario)', async () => {
    // Vehicle ABC123: no telematics, no reliable odometer -- every trip
    // this period was logged map-assisted, so 100% of the distance this
    // KPI reports is map-derived, not observed.
    mockRepositoriesWithTripStats({
      totalDistance: 42,
      totalTrips: 1,
      distanceBySource: { 'map-derived': 42 },
      observedDistance: 0,
      estimatedDistance: 42,
    });

    const result = await fleetAnalyticsService.getFleetKPIs(TENANT, undefined, undefined, true);

    expect(result.totalDistance).toBe(42);
    expect(result.estimatedDistanceKm).toBe(42);
    // The frontend's "fully estimated" branch keys off this exact
    // relationship (estimatedDistanceKm >= totalDistance) -- pin it.
    expect(result.estimatedDistanceKm).toBeGreaterThanOrEqual(result.totalDistance);
  });

  it('is a partial figure for a fleet mixing GPS/odometer trips with map-assisted ones', async () => {
    mockRepositoriesWithTripStats({
      totalDistance: 1000,
      totalTrips: 10,
      distanceBySource: { 'gps-path': 600, 'odometer': 200, 'map-derived': 150, manual: 50 },
      observedDistance: 800,
      estimatedDistance: 200,
    });

    const result = await fleetAnalyticsService.getFleetKPIs(TENANT, undefined, undefined, true);

    expect(result.totalDistance).toBe(1000);
    expect(result.estimatedDistanceKm).toBe(200);
    expect(result.estimatedDistanceKm).toBeLessThan(result.totalDistance);
  });
});

describe('WORKSHOP_MANAGER: the concrete role this redaction protects', () => {
  it('holds ANALYTICS_VIEW + REPORT_VIEW (can reach the Fleet Summary) but neither EXPENSE_VIEW nor FUEL_VIEW nor FINANCE_VIEW', () => {
    const perms = rolePermissions[Role.WORKSHOP_MANAGER];
    expect(perms).toContain(Permission.ANALYTICS_VIEW);
    expect(perms).toContain(Permission.REPORT_VIEW);
    expect(perms).not.toContain(Permission.EXPENSE_VIEW);
    expect(perms).not.toContain(Permission.FUEL_VIEW);
    expect(perms).not.toContain(Permission.FINANCE_VIEW);
  });

  it('analytics.controller.ts\'s exact permission check (hasAnyPermission over EXPENSE_VIEW/FUEL_VIEW/FINANCE_VIEW) evaluates to false for this role', () => {
    const context: AuthContext = {
      userId: 'u1',
      tenantId: TENANT,
      roles: [Role.WORKSHOP_MANAGER],
      permissions: rolePermissions[Role.WORKSHOP_MANAGER],
      canBypassRbac: false,
      isPlatformAdmin: false,
      isSuperAdmin: false,
    } as AuthContext;

    expect(
      hasAnyPermission(context, [Permission.EXPENSE_VIEW, Permission.FUEL_VIEW, Permission.FINANCE_VIEW])
    ).toBe(false);
  });

  it('the same check evaluates to true for FLEET_MANAGER, which holds EXPENSE_VIEW and FUEL_VIEW', () => {
    const context: AuthContext = {
      userId: 'u2',
      tenantId: TENANT,
      roles: [Role.FLEET_MANAGER],
      permissions: rolePermissions[Role.FLEET_MANAGER],
      canBypassRbac: false,
      isPlatformAdmin: false,
      isSuperAdmin: false,
    } as AuthContext;

    expect(
      hasAnyPermission(context, [Permission.EXPENSE_VIEW, Permission.FUEL_VIEW, Permission.FINANCE_VIEW])
    ).toBe(true);
  });
});
